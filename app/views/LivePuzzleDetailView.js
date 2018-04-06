define([
	'views/LiveTrialView',
	'utils',
	'ColorParse',
	'jquery',
	'backbone'

], function (LiveTrialView, Utils, ColorParse) {
	return Backbone.View.extend({
		NAME: 'LivePuzzleDetailView',

		currentTrialView: null,
		$progressBar: null,

		puzzle: null,
		opponent: null,

		initialize : function(options) {
			var self 				= this;
			self.colorsapp 			= options.colorsapp;
			self.puzzle 			= options.puzzle;
			self.opponent			= options.opponent;
			self.mode 				= options.mode;
			self.stressMode			= options.stressMode;

			this.chatMessageMinInterval = 2000;
			this.lastChatMessage = 0;
		},

		render : function() {
			var self = this;
			
			self.$el.html(self.colorsapp.template("LivePuzzleDetailViewTemplate", {
				header : self.mode == 'sender' 
					? Utils.tr("label_my_new_puzzle") 
					: Utils.tr("label_puzzle_by", {
						playerName: Utils.pseudo(self.colorsapp, self.opponent.id)
					})
			}));

			self.$progressBar = self.$el.find('.progressBar');

			self.$el.addClass("liveSession");
			self.$livechat = self.$el.find('.livechat');
			
			if (self.stressMode) {
				console.log('START STRESS LOOP');
                self.stressLoop = Utils.sound.playSound('stress_loop', false, true);
            }

			self.addEventListeners();
		},
		
		addEventListeners: function(){
			this.$livechat.find('li').on('click', this.handleChatClicked.bind(this));
		},
		
		removeEventListeners: function(){
			this.$livechat.find('li').off('click');
		},

		handleChatClicked: function(event) {
			var now = Date.now();
			var elapsed = now - this.lastChatMessage;
			if (elapsed < this.chatMessageMinInterval) {
				return;
			}
			this.lastChatMessage = now;

			var $el = $(event.currentTarget);
			var message = $el.data("chat-msg");
			this.flashChatButton($el);
			Utils.sound.playSound("chat_" + message.toLowerCase());
			this.trigger('chat_message', message);
		},

		receivedChatMessage: function(message) {
			var $el = this.$livechat.find("[data-chat-msg='" + message + "']");
			this.flashChatButton($el);
			Utils.sound.playSound("chat_" + message.toLowerCase());
		},

		flashChatButton: function($el) {
			$el.removeClass("chatflash");
			$el[0].offsetWidth; // Trigger reflow to reset animation
			$el.addClass("chatflash");
		},
		
		destroy: function(){
			this.removeEventListeners();

			if (this.stressLoop) {
                this.stressLoop.pause();
                this.stressLoop = null;
            }
		},
		
		onBeforeHide : function() {
			console.log("onbefore PuzzleDetailView hide reached");
			this.destroy();
			this.stopCountdown();
		},

		receiverTrialUpdate: function(trial) {
			var symbols = trial.get('sender_symbols');
			if (symbols) {
				this.currentTrialView.setSenderSymbols(symbols);
			}
		},

		showTrial : function(trial) {
			if (this.currentTrialView) {
				this.currentTrialView.destroy();
			}

			var step = trial.get('step');
			var total = trial.get('total_steps');
			var progress = (step - 1) / total * 100;
			this.$progressBar.css('width', progress + '%');

			this.currentTrialView = new LiveTrialView({
				colorsapp: this.colorsapp,
				eventbus: this,
				trial: trial,
				mode: this.mode,
				stressMode: this.stressMode
			});
			this.currentTrialView.render();
			this.$el.find('.currentTrial').append(this.currentTrialView.$el);
		},

		getDisplayedColors: function() {
			if (!this.currentTrialView) {
				console.error('LivePuzzleDetailView.getDisplayedColors: No current trial set');
				return null;
			}

			return this.currentTrialView.pickDisplayColors;
		},

		startCountdown: function(remaining) {
			var self = this;

			var finishTime = new Date(Date.now() + remaining);
			var screenWidth = window.innerWidth;

			self.countdown = setInterval(function() {
				var timeleft = Math.max(finishTime - Date.now(), 0);

				if (self.currentTrialView.$timerBar) {
					self.currentTrialView.$timerBar.css("width", screenWidth * (timeleft / remaining) + "px");
				}
				
				if (timeleft == 0) {
					self.stopCountdown();
				}
			}, 50);
		},

		stopCountdown: function() {
			if (this.currentTrialView.$timerBar) {
				this.currentTrialView.$timerBar.css("width", "0px");
			}
			clearInterval(this.countdown);
		},
	});
});
