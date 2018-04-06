define([
	'live/live',
	'utils',
	'parse',
	'ColorParse',
	'prefetchImage',
	'views/MainLayoutView',
	'views/PuzzleStartPromptView',
	'views/PuzzleReceiverView',
	'views/TutorialMessagesView',
	'underscore',
	'jquery',
	'require',
	'backbone'
], function (
	Live, Utils, Parse, ColorParse, prefetchImage,
	MainLayoutView, PuzzleStartPromptView, PuzzleReceiverView, TutorialMessagesView
) {

	var DEFAULT_NO_INTERNET_PROMPT = 'Shoot, can\'t connect! Please make sure you have a steady internet connection.';

	return Backbone.Model.extend({

		actView : null,
		currentNewPuzzle: null,
		symbols: null,
		USER_COOKE: 'colorGameUserName',
		friendsCollection : null, 
		live: null,
		offline: false,
		userFetched: false,
		totalSplashes: 12,
		stressMode: false,

        initialize : function ( options ) {
			
			var self = this;
			
			window.Utils = Utils;
			window.app = this;
			window.Parse = Parse;
			this.parseServerUrl = options.parseServerUrl;
			this.debug = options.debug === true;
			this.ipFilter = !this.debug;
			
        	this.initialHref = window.location.href;
			
			this.spinner($("#ColorsApp"));

			this.$noInternetWarning = $('.noInternetBanner');
			this.$noInternetWarning.find('.message').html(DEFAULT_NO_INTERNET_PROMPT);
			this.$noInternetWarning.click(function() {
				window.location.reload();
				self.restartApplication();
			});

			this.$errorWarning = $('.errorBanner');
			this.$errorWarning.click(function() {
				window.location.reload();
				self.restartApplication();
			});

			this.handleErrorBound = this.handleError.bind(this);
			window.onerror = function(msg, url, line, col, error) {
				self.handleError(msg);
			};
			
			Utils.sound.init();	
			
        	this.friendsCollection = new Backbone.Collection();
        	this.friendsCollection.comparator = function(item) {
        		return 5 - item.get("status");
        	}
			
			this.initParse()
				.then(function() {

					self.initPush();
					return self.preloadGlobalData();

				})
				.then(function() {
					
					self.prepareUI();
					
				})
				.catch(self.handleErrorBound);
			
			self.on("userWasFetched",function(){

				if(!self.userFetched)
				{
					self.userFetched = true;

					self.fetchIP();
					
					self.initGlobalContext();
					
					self.checkStressMode();
				}
				
				if (!self.live)
				{
					self.live = new Live({ 
						app: self,
						user: self.user
					});
				}
			});
        },

		// keep startup url (in case your app is an SPA with html5 url routing)
		restartApplication : function() {
			
		  // Show splash screen (useful if your app takes time to load) 
		  navigator.splashscreen.show();
		  // Reload original app url (ie your index.html file)
		  window.location = this.initialHref;
		},

		initGlobalContext: function() {
			var self = this;

			var context = {
				user: self.getUser(),
				pseudo : Utils.pseudo(self, self.getUser().id)
			};

			if (typeof(cordova) != "undefined") {
				cordova.getAppVersion.getVersionNumber()
					.then(function(version) {
						context.appVersion = version;
						Utils.trPushContext('user', context);
					})
					.catch(self.handleErrorBound);
			} else {
				context.appVersion = 'dev';
				Utils.trPushContext('user', context);
			}
		},

		initPush : function() {
			if (window.ParsePushPlugin) {
				var self = this;
				ParsePushPlugin.on('receivePN', function(pn) {
					console.log('receivePN', pn);
					// openPN is never triggered on Android
					if (device.platform == "Android") {
						self.handlePushNotification(pn);
					}
				});
				
				ParsePushPlugin.on('openPN', function(pn) {
					console.log('openPN', pn);
					self.handlePushNotification(pn);
				});

				document.addEventListener('resume', this.resetBadge.bind(this), false);
				this.resetBadge();
			}
		},

		handlePushNotification: function(push) {
			var self = this;
			console.log('Received push notification: ', push);
			
			var inviteId = push.inviteId;
			new ColorParse.Query('PuzzleInvite')
				.include('puzzle')
				.get(inviteId)
				.then(function(invite) {
					self.playPuzzlePrompt(invite.get('puzzle'), invite);
				});
		},

		resetBadge: function() {
			if (window.ParsePushPlugin) {
				ParsePushPlugin.resetBadge(function() {
					console.log('Reset badge count.');
				}, function() {
					console.error('Failed to reset badge count.');
				});
			}
		},

		getPushEnabled: function() {
			if (window.ParsePushPlugin) {
				return new Promise(function(resolve, reject) {
					ParsePushPlugin.getSubscriptions(function(subscriptions) {
						resolve(subscriptions && subscriptions.includes('receive_puzzle'));
					}, function(error) {
						reject(error);
					});
				});
			} else {
				return Promise.resolve(undefined);
			}
		},

		setPushEnabled: function(enabled) {
			if (window.ParsePushPlugin) {
				return this.getPushEnabled()
					.then(function(enabled) {
						return new Promise(function(resolve, reject) {
							if (enabled) {
								ParsePushPlugin.unsubscribe('receive_puzzle', resolve, reject);
							} else {
								ParsePushPlugin.subscribe('receive_puzzle', resolve, reject);
							}
						});
					})
					.catch(self.handleErrorBound);
			} else {
				return Promise.resolve(false);
			}
		},

		initParse : function() {
			var self = this;

			if (self.parseInitialized) {
				return Promise.resolve();
			}
			if (!Parse) {
				return Promise.reject('Parse SDK not found.');
			}
			
			return Promise.resolve()
				.then(function() {
					return new Promise(function(resolve, reject) {
						if (window.ParsePushPlugin) {
							ParsePushPlugin.getInstallationId(function(id) {
								console.log("Overriding installation ID: " + id);
								// Usually JavaScript generates a random installation ID
								// we pre-fill the cache here with the device installation id
								// to get the Parse JavaScript SDK to use it instead of 
								// generating one, which then properly associates the
								// user's session with the device's installation id.
								Parse.CoreManager
									.getInstallationController()
									._setInstallationIdCache(id);
								resolve();
							}, function(e) {
								reject(e);
							});
						} else {
							resolve();
						}
					});
				})
				.then(function() {
					Parse.initialize( 'ett001ColorGame' );
					Parse.serverURL = self.parseServerUrl;
					
					if (window.ParsePushPlugin) {
						// Save the current server url so that the native Parse SDK
						// uses the current server next time the app starts up
						ParsePushPlugin.overrideServerUrl(self.parseServerUrl);
					}

					ColorParse.on('timeout', self.onParseTimeout.bind(self));
					ColorParse.on('query_success', self.onParseSuccess.bind(self));
					ColorParse.on('error', self.onParseError.bind(self));
	
					var classes = [
						'AppGlobals', 'AvatarColor', 'AvatarImage', 'Color', 'Group', 'I18N', 
						'Level', 'LiveSession', 'Message', 'NotebookNote',
						'Puzzle', 'PuzzleInvite', 'PuzzlePointTracking',
						'Symbol', 'Trial', 'Wallet'
					];
					classes.forEach(function(className) {
						Parse.Object.registerSubclass(className, ColorParse.Object.extend(className));
					});
					
					self.parseInitialized = true;
				});
		},
		
		onParseTimeout: function() {
			console.error('Parse query timed out');
			this.displayConnectionWarning(true);
		},

		onParseSuccess: function(result) {
			// ...
		},

		onParseError: function(error) {
			this.handleError(error);
		},

		handleError: function(error) {
			if (error instanceof Parse.Error && error.code == 209) {
				console.warn('Got invalid session id error, trying to log user out...');
				this.offline = true;
				Parse.User.logOut()
					.always(function() {
						window.location.reload();
					});
			} else {
				console.error(error);
				this.displayError(error);
			}
		},

		preloadGlobalData: function (){
			var self = this;
			
			return Promise.all([
				new ColorParse.Query("AppGlobals")
					.first(), 
				new ColorParse.Query('Color')
					.equalTo('enabled', true)
					.limit(1000)
					.find(), 
				new ColorParse.Query('Symbol')
					.limit(1000)
					.find(), 
				new ColorParse.Query('Level')
					.addAscending('points_required')
					.limit(1000)
					.find(), 
				Utils.preloadPhrases("en"),
				Utils.loadAvatars()
			]).then( function(results){
				
				self.globalSettings = results[0];
				self.colors = results[1];
				self.symbols = results[2];
				self.levels = results[3];
				
				// Preload enabled symbols
				var urls = self.symbols
					.filter(function(s) { return s.get('enabled'); })
					.map(function(s) { return s.get('image_path').url(); });
				prefetchImage.default(urls);

				// Set Parse queries timeout
				ColorParse.timeout = self.globalSettings.get("internet_timeout") * 1000;

				// reset the no internet prompt as now phrases are available.
				self.$noInternetWarning.find('.message').html(Utils.tr("prompt_no_internet"));
			});
		},
		
		logout: function(){
			
			ColorParse.User.logOut();
			window.location.reload();
		},
		spinner : function(target) {
			
			this.trigger("isLoading",target != null);
		},
		
		spinnerOff : function() {
			this.trigger("isLoading",null);
		},

		prepareUI : function() {
			var oneSize = this.getSymbolMaxSize();
			var diff = screen.width%oneSize;
			var howMany = (screen.width - diff)/oneSize;
			if(diff) {
				howMany++;
				oneSize -= (oneSize - diff)/howMany;
			}

			this.ui = new MainLayoutView({colorsapp : this, oneDesignUnit : oneSize});
			this.ui.render();
			$( "#ColorsApp").append( this.ui.$el );

			if (window.statusbar) {
				window.statusbar.visible = false;
			}
		},

		prepareTranslatedUI: function()
		{
			this.tutorial = new TutorialMessagesView({ colorsapp: this });
			this.tutorial.render();
			$( "#ColorsApp").append( this.tutorial.$el );
		},
		
		setCookie: function(name, value, days) {
			var expires;
			if (days) {
				var date = new Date();
				date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
				expires = "; expires=" + date.toGMTString();
			}
			else {
				expires = "";
			}
			document.cookie = name + "=" + value + expires + "; path=/";
		},
		
		getCookie: function( c_name ) {
			if (document.cookie.length > 0) {
				c_start = document.cookie.indexOf(c_name + "=");
				if (c_start != -1) {
					c_start = c_start + c_name.length + 1;
					c_end = document.cookie.indexOf(";", c_start);
					if (c_end == -1) {
						c_end = document.cookie.length;
					}
					return decodeURI(document.cookie.substring(c_start, c_end));
				}
			}
			return "";
		},
		
		getUser: function() {
			if(!this.user) {
				
				this.user = ColorParse.User.current();
				
				if(!this.user) {
					return null;
				}
			}
			
			return this.user;
		},
		
		fetchUser: function() {
			
			var self = this;
			if(!self.getUser()){
				return Promise.reject("not authenticated");
			}
			var self = this;
			var query = new ColorParse.Query('_User');
			query.include([
				'wallet', 'level', 'level.level_name', 'level.rank_graphic'
			]);
			
			return query.get(self.getUser().id).then(function(user) {
				self.user = user;
				self.trigger("userWasFetched");		
			});
		},

		fetchIP : function() {
			ColorParse.Cloud.run('updateUserIp')
				.then(function(result) {
					console.log('Updated user ip to: ' + result.ip);
				})
				.catch(this.handleErrorBound);
		},
		
		userAuthenticated: function(callbackFunctions) {
			
			var self = this;
			return new Promise(function(resolve,reject){
				
				if(self.getUser()){
					var query = new ColorParse.Query("AppGlobals");
					query.find().then(function(){
						resolve();
					}).catch(function(e){
						reject();
					});
					
				} else {
					reject();
				}
			});
		},

		incrementUserWallet: function(deltas, user)
		{
			user = user || this.getUser();
			var wallet = user.get('wallet');
			_.forEach(deltas, function(delta, key) {
				wallet.increment(key, delta);
			});
			return wallet.save();
		},

		getUserPoints: function() {
			var points = 0;
			var user = this.getUser();
			var wallet;
			
			if(user){
				wallet = user.get('wallet');
				points = wallet.get('sender_points') + wallet.get('receiver_points');
			}
			
			return points;
		},
		
		
		getSymbolMaxSize: function() {
			return 65;
		},
		getPuzzleCost: function() {
			var value = this.globalSettings.get('puzzle_cost');
			return value !== undefined ? value : 50;
		},
		getWinQuota: function(stress) {
			var prefix = stress ? 'stress_' : '';
			var value = this.globalSettings.get(prefix + 'puzzle_quota_for_win');
			return value !== undefined ? value : 0.25;
		},
		getBonusQuota: function(stress) {
			var prefix = stress ? 'stress_' : '';
			var value = this.globalSettings.get(prefix + 'puzzle_quota_for_bonus');
			return value !== undefined ? value : 0.9;
		},
		getWinPointsReceiver: function(stress) {
			var prefix = stress ? 'stress_' : '';
			var value = this.globalSettings.get(prefix + 'puzzle_win_points_receiver');
			return value !== undefined ? value : 100;
		},
		getBonusPointsReceiver: function(stress) {
			var prefix = stress ? 'stress_' : '';
			var value = this.globalSettings.get(prefix + 'puzzle_bonus_points_receiver');
			return value !== undefined ? value : 50;
		},
		getWinPointsSender: function(stress) {
			var prefix = stress ? 'stress_' : '';
			var value = this.globalSettings.get(prefix + 'puzzle_win_points_sender');
			return value !== undefined ? value : 100;
		},
		getBonusPointsSender: function(stress) {
			var prefix = stress ? 'stress_' : '';
			var value = this.globalSettings.get(prefix + 'puzzle_bonus_points_sender');
			return value !== undefined ? value : 50;
		},
		getPuzzleLifespan: function(){
			var value = this.globalSettings.get('puzzle_lifespan');
			return value !== undefined ? value : 240;
		},
		getLiveModeTimeout: function(){
			var value = this.globalSettings.get("live_mode_timeout");
			return value !== undefined ? value : 10;
		},
		getMaxSenderSymbols: function(){
			var value = this.globalSettings.get("max_sender_symbols");
			return value !== undefined ? value : 10;
		},
		getStressMinLevel: function(){
			var value = this.globalSettings.get("stress_min_level");
			return value !== undefined ? value : 12;
		},
		getStressModeAsyncSenderTime: function(){
			var value = this.globalSettings.get("async_stress_sender_time");
			return value !== undefined ? value : 3;
		},
		getStressModeAsyncReceiverTime: function(){
			var value = this.globalSettings.get("async_stress_receiver_time");
			return value !== undefined ? value : 1;
		},
		getStressModeSyncTime: function(){
			var value = this.globalSettings.get("sync_stress_time");
			return value !== undefined ? value : 10;
		},

		getRandomColorSet: function(usedSetsIds) {
			usedSetsIds = usedSetsIds || [];
			for (var i = 0; i < 100; i++) {
				var set = _.sample(this.colors);
				if (!usedSetsIds.includes(set.id)) {
					return set;
				}
			}
			console.error('Exhausted max tries trying to select a random color set.');
			return null;
		},
		
		getSymbolList: function(){
			return this.getUser().get("keyboard");
		},
		
		getCoverNames: function(){
			return this.globalSettings.get('cover_names');
		},

		getLeaderboardInitials: function() {
			return this.globalSettings.get('leaderboard_initials');
		},

		getLeaderboardNames: function(){
			return this.globalSettings.get('leaderboard_names');
		},
		
		checkKeyboard: function()
		{
			var user = this.getUser();
			var needsToSave = false;
			
			// Remove deleted symbols
			var keyb = user.get('keyboard') || [];
			for (var i = keyb.length - 1; i >= 0; i--) {
				if (!keyb[i].createdAt || !keyb[i].get('enabled')) {
					console.warn('Removing deleted or disabled symbol ' + keyb[i].id);
					keyb.splice(i, 1);
					needsToSave = true;
				}
			}
			if (needsToSave) {
				user.set('keyboard', keyb);
				user.save();
			}

			// Fill up keyboard
			var expected = this.numberOfKeysForLevel(user.get('level'));
			if (keyb.length < expected) {
				var howmany = expected - keyb.length;

				var keysQ = new ColorParse.Query('Symbol');				
				keysQ.notEqualTo("for_tutorial", true);
				keysQ.equalTo('enabled', true);
				keysQ.notContainedIn("objectId", keyb.map(function(s) { return s.id; }));

				keysQ.limit(1000); // Parse maximum
				return keysQ.find().then(function(symbols) {
					var added = new Array();
					for (var i = 0; i < howmany ; i++) {
						if (symbols.length == 0) {
							console.error("No more symbols to add to keyboard.");
							break;
						}
						var index = Math.floor(Math.random() * symbols.length);
						added.push(symbols.splice(index, 1)[0]);
					}

					user.set("keyboard", keyb.concat(added));
					user.save();

					return added;
				});
			
			// Nothing to add
			} else {
				return Promise.resolve([]);
			}
		},

		/**
		 * Get the user points with the tutorial and initial points subtracted.
		 * @returns {*}
		 */
		getUserPointsForLevelAssignment: function(){
			var self 		= this;
			var userPoints 	= self.getUser().get("wallet").get("receiver_points") + self.getUser().get("wallet").get("sender_points");
			userPoints 	   -= 2 * self.globalSettings.get("tutorial_points"); // subtract points for playing trial as receiver and sender
			userPoints     -= self.globalSettings.get("first_trial_points");
			
			// Make sure the user at least has the lowest level
			if(userPoints < 0) {
				userPoints = 0;
			}
			
			return userPoints;
		},
		/**
		 * Get the level for the current user.
		 * @param userPoints
		 * @returns {*}
		 */
		getCurrentLevel: function(userPoints) {
			var self 			= this;
			var currentLevel 	= null;
			var userLevel 		= self.getUser().get('level');
			
			_.each(self.levels, function(level){
				if(level.get('points_required') <= userPoints) {
					if(!currentLevel) {
						currentLevel = level;
						return; // continue
					}
					
					currentLevel = (level.get('points_required') > currentLevel.get('points_required')) ? level : currentLevel
				}
			});
			
			// if the user had a higher level before, keep that level.
			return (userLevel && userLevel.get('points_required') > currentLevel.get('points_required')) ? userLevel : currentLevel;
		},
		
		/**
		 * Returns wether a user has unlocked stress mode.
		 * @param user Parse user object
		 * @returns {boolean}
		 */
		hasStressMode: function(user) {
			var level = user.get('level');
			if (!level)
				return false;

			var levelId = user.get('level').id;
			var minLevel = this.getStressMinLevel();

			if (this.levels.length < minLevel)
				return false;
			
			for (var i = minLevel - 1; i < this.levels.length; i++) {
				if (this.levels[i].id == levelId) {
					return true;
				}
			}

			return false;
		},

		/**
		 * Check wether the current user has stress mode unlocked.
		 * Updates this.stressMode and trigger stressmode_changed
		 */
		checkStressMode: function() {
			var unlocked = this.hasStressMode(this.getUser());
			if (this.stressMode != unlocked) {
				this.stressMode = unlocked;
				this.trigger('stressmode_changed', unlocked);
			}
		},

		/**
		 * Get the number of keys that should be in a user's 
		 * keyboard for the given level.
		 */
		numberOfKeysForLevel: function(level) {
			var keys = this.globalSettings.get("keys_in_basic_keyboard");

			if (!level || level.className !== 'Level') {
				console.error('numberOfKeysForLevel: No level given, got ', level);
				return keys;
			}

			for (var i = 0; i < this.levels.length; i++) {
				keys += this.levels[i].get('added_symbols');

				if (level.id == this.levels[i].id)
					break;
			}

			return keys;
		},
		
		checkRank : function()  {
			var self 			= this;
			var currentLevel 	= self.getCurrentLevel(self.getUserPointsForLevelAssignment());
			var user 			= self.getUser();
			
			if(!currentLevel) {
				return;
			}
			
			if(!user.get('level') || currentLevel.id != user.get("level").id) {
				user.set("level", currentLevel);

				self.checkStressMode();
				
				self.checkKeyboard().then(function(added) {
					self.trigger("rankChanged");

					self.promptTr("label_level_up", {
						levelname : currentLevel.get("level_name").get(user.get("language")),
						newkeys : added.length,
						added: added.map(function(s) { return s.get('image_path').url(); })
					});
				});
			}
		},

		prompt: function(msg, options)
		{
			options = options || {};
			options.text = msg;
			this.trigger('prompt', options);
		},

		promptTr: function(key, options)
		{
			var msg = Utils.tr(key, options);
			this.prompt(msg, options);
		},

		playPuzzlePrompt: function(puzzle, invite) {
			var self = this;

			if (self.puzzleStartView) {
				return;
			}

			if (invite) {
				// Since there's no way to check if a parse object has been
				// destroyed we set this flag here so it can be checked elswhere
				// thanks to single instance objects.
				invite.set('destroyed', true);
				invite.destroy();
				self.trigger('invitesChanged');
			}

			Utils.sound.playSound("puzzle_open");

			if (self.getUserPoints() < self.getPuzzleCost()) {
				self.prompt($("#PromptNotEnoughPointsTemplate").html());
				return;
			}

			var view = new PuzzleStartPromptView( {
				colorsapp: self,
				puzzle: puzzle,
				is_invite: invite != null
			});
			view.render();
			self.ui.$el.append(view.$el);
			
			var close = function() {
				view.leave().promise().done(function(){
					view.$el.detach();
				});
				self.puzzleStartView = null;
			};

			view.on("play",function() {
				var query = new ColorParse.Query('Puzzle');
				query.include('sender', 'trials', 'trials.colors');
				query.get(puzzle.id).then(function(puzzle) {
					close();
					self.startPuzzle(puzzle);
				});
			});
			
			view.on("cancel", close);
			
			self.puzzleStartView = view;
		},

		startPuzzle: function(puzzle) {
			var self = this;

			var puzzlePlayView = new PuzzleReceiverView({
				puzzle: puzzle,
				colorsapp: self
			});
			
			puzzle.fetch().then(function(){
				// tracking: store receiver start time
				var receiverStart = puzzle.get('receiver_start');
				receiverStart.push(new Date());
				puzzle.set('receiver_start', receiverStart);
			});
			
			puzzlePlayView.render();

			self.ui.pushView(puzzlePlayView, true);

			puzzlePlayView.on("finished",function(){
				// tracking: store receiver end time
				var receiverEnd = puzzle.get('receiver_end');
				receiverEnd.push(new Date());
				puzzle.set('receiver_end', receiverEnd);
				puzzle.save();
			
				self.ui.popView('LobbyView');
			});
		},

		template: function(name, options)
		{
			var vars = Utils.trGetContext();
			vars.Utils = Utils;
			Object.assign(vars, options);

			var contextName = 'template:' + name;
			Utils.trPushContext(contextName, options);

			var source = $('#' + name).html();
			var html = _.template(source)(vars);

			Utils.trPopContext(contextName);

			return html;
		},

		createNewTrial: function(puzzle, attributes, usedColorSetIds) {
			var self = this;

			var colorSet = self.getRandomColorSet(usedColorSetIds);
			var colorValues = colorSet.get('color_set');
			var selectedColor = Math.floor(Math.random() * colorValues.length);

			attributes = _.assign({
				puzzle_id: puzzle,
				sender: puzzle.get('sender'),
				colors: colorSet,
				splash: self.chooseSplash(colorValues),
				set_of_symbols: self.getSymbolList(),
				selected_color: selectedColor,
				selected_color_value: colorValues[selectedColor],
				is_live: false,
				stress_mode: puzzle.get('stress_mode'),
				step: 1,
				total_steps: self.getTotalSteps(),
				symbol_input_tracking: [],
				sender_chat_messages: [],
				receiver_chat_messages: []
			}, attributes);
			
			return new ColorParse.Object('Trial', attributes);
		},

		createNewPuzzle: function(attributes){
			var self = this;
			
			attributes = _.assign({
				trials: [],
				receivers: [],
				points_total: 0,
				cost: self.getPuzzleCost(),
				sender: self.getUser(),
				sender_moiety: self.getUser().get('moiety'),
				is_live: false,
				puzzle_start: new Date(),
				receiver_start: [],
				receiver_end: [],
			}, attributes);
			
			return new ColorParse.Object('Puzzle', attributes);
		},

		trialAddPick: function(trial, pickedColor, displayedColors, duration)
		{
			var user = this.getUser();
			var colorSet = trial.get('colors').get('color_set');

			var pick = {
				receiver: user.id,
				receiver_moiety: user.get('moiety'),
				correct_answer: pickedColor === trial.get('selected_color_value'),
				color_pick: colorSet.indexOf(pickedColor),
				displayed_colors: displayedColors,
				time_receiver: duration
			};
			trial.add('picks', pick);
			return pick;
		},

		getTotalSteps: function(){
			var self = this;
			return self.globalSettings.get('trials_in_puzzle');
		},

		chooseSplash: function(colors)
		{
			return Math.floor(Math.random() * this.totalSplashes) + 1;
		},

		combineColorsAndSplashes: function(trialOrColors, splash)
		{
			var colors;
			if (trialOrColors.className === 'Trial') {
				colors = trialOrColors.get('colors').get('color_set');
				splash = trialOrColors.get('splash');
			} else {
				colors = trialOrColors;
			}

			if (splash === undefined) {
				console.warn('Splash is not set, choosing randomly.');
				splash = this.chooseSplash();
			}

			var combined = [];
			for (var i = 0; i < colors.length; i++) {
				combined.push({
					color: colors[i],
					splash: this.template("ColorSplash" + splash + "Template", {
						color: colors[i]
					})
				});
			}

			return combined;
		},
		
		trackSymbolInteraction: function(trial, symbolId, action){
			var symbolInputTracking = trial.get('symbol_input_tracking');
			symbolInputTracking.push({
				symbol_id: symbolId,
				action: action,
				time: new Date()
			});
			
			trial.set('symbol_input_tracking', symbolInputTracking);
		},


		saveQuota: function(picksa, puzzle) {
			var self = this;

			var stressMode = puzzle.get('stress_mode');

			var hits = 0;
			var picks = 0;
			_.each(picksa, function(pick) {
				if(pick.correct_answer) {
					hits += 1;
				}
				picks += 1;
			});
			var quota =  hits/picks;

			var winReached = quota >= self.getWinQuota(stressMode);
			var bonusReached = quota >= self.getBonusQuota(stressMode);

			var senderPoints = 0, senderBonus = 0, receiverPoints = 0, receiverBonus = 0;
			if (puzzle.get('is_live')) {
				// Synch mode: Both get points based on performance
				if (winReached) {
					receiverPoints = self.getWinPointsReceiver(stressMode);
					senderPoints = self.getWinPointsSender(stressMode);
				}
				if (bonusReached) {
					receiverBonus = self.getBonusPointsReceiver(stressMode);
					senderBonus = self.getBonusPointsSender(stressMode);
				}
			} else {
				// Async mode: Receiver gets points based on performance,
				// sender gets a fixed amount
				if (winReached) {
					receiverPoints = self.getWinPointsReceiver(stressMode);
				}
				if (bonusReached) {
					receiverBonus = self.getBonusPointsReceiver(stressMode);
				}
				senderPoints = self.getWinPointsSender(stressMode);
				senderBonus = 0;
			}

			var puzzlePointTracking = new ColorParse.Object('PuzzlePointTracking');
			puzzlePointTracking.set('puzzle', puzzle);
			puzzlePointTracking.set('receiver', self.getUser());
			puzzlePointTracking.set('quota', quota);
			puzzlePointTracking.set('puzzle_cost', self.getPuzzleCost());
			puzzlePointTracking.set('receiver_points_won', receiverPoints);
			puzzlePointTracking.set('receiver_points_bonus', receiverBonus);
			puzzlePointTracking.set('sender_points_won', senderPoints);
			puzzlePointTracking.set('sender_points_bonus', senderBonus);

			return puzzlePointTracking.save();
		},

        haveInteractionWithUser : function(userid) {
        	var self = this;
        	var me = self.getUser();
        	var ins = me.get("interactions");
        	if(!ins) {
        		ins = {};
        	}
        	ins[userid] = new Date().getTime();
        	me.set("interactions", ins);
        	me.save();
        },
		
		displayConnectionWarning : function() {	
			if (this.offline) {
				return;
			}
			this.offline = true;

			ColorParse.User.logOut();
			this.spinnerOff();
			this.$noInternetWarning.show();
			console.log("no internet",self);
			var audio = new Audio("app/assets/audio/puzzle_fail.mp3");
			audio.play();
		},

		displayError: function(error) {
			if (this.offline) {
				return;
			}
			this.offline = true;
			
			ColorParse.User.logOut();
			this.spinnerOff();

			var message = (error.message !== undefined ? error.message : error);
			this.$errorWarning.find('.message').html(message);
			this.$errorWarning.show();

			var audio = new Audio("app/assets/audio/puzzle_fail.mp3");
			audio.play();
		},
	});
 });