define([
        'ColorParse',
        'utils',
		'require',
		"soundUtils"

	], function (ColorParse, Utils,require,SoundUtils) {

	// return a simple utils object 
	return {	
		
		randomizeHashPerUser: true,
		hashCode : function(str) {
		    var hash = 0;
			
			if(this.randomizeHashPerUser)
			{
				if(ColorParse.User.current() && str != ColorParse.User.current().id) {
	 		    	hash = this.hashCode(ColorParse.User.current().id);	
				}
			}
		    if (str.length == 0) return hash;
		    for (i = 0; i < str.length; i++) {
		        char = str.charCodeAt(i);
		        hash = ((hash<<5)-hash)+char;
		        hash = hash & hash; // Convert to 32bit integer
		    }
		    if(hash < 0) {
		    	hash = -hash;
		    }
		    return hash;
		},

		pseudo : function(colorsapp, userid) {
			var names = colorsapp.getCoverNames();
			return names[this.hashCode(userid + "First")%names.length] 
				+ " " 
				+ names[this.hashCode(userid)%names.length];
		},

		leaderboardPseudo: function(colorsapp, userid) {
			var initials = colorsapp.getLeaderboardInitials();
			var names = colorsapp.getLeaderboardNames();
			return initials.charAt(this.hashCode(userid) % initials.length)
				+ ". " 
				+ names[this.hashCode(userid) % names.length];
		},

		avatar_colors: [],
		avatar_images: [],

		loadAvatars: function() {
			var self = this;
			return Promise.all([
				new ColorParse.Query('AvatarColor')
					.equalTo('enabled', true)
					.limit(1000)
					.find(),
				new ColorParse.Query('AvatarImage')
					.equalTo('enabled', true)
					.limit(1000)
					.find(),
			]).then(function(results) {
				self.avatar_colors = results[0];
				self.avatar_images = results[1];
			});
		},

		avatar: function(user)
		{
			var imageHash = this.hashCode(user.id + "Image");
			var image = this.avatar_images[imageHash % this.avatar_images.length];

			var colorHash = this.hashCode(user.id + "Color");
			var color = this.avatar_colors[imageHash % this.avatar_colors.length];

			return _.template($('#AvatarTemplate').html())({
				color: color.get('value'),
				image: image.get('image').url()
			});
		},

		phrases : {},

		preloadPhrases : function(language) {
			
			var self = this;
			return new Promise(function(resolve,reject)	{
				var pq = new ColorParse.Query('I18N');
				pq.limit(1000); // Maximum possible for a query
				pq.find({ success : function(phrases) {
					for(var i = 0; i < phrases.length; i++) {
						self.phrases[phrases[i].get("key")] = phrases[i].get(language);
					}
				//	console.log("phrases", JSON.stringify(self.phrases));
					resolve();
				}, error : function() {
					reject();
				}});
			});
		},

		unknownPhrases: [],
		trContexts: [],

		// returns translated phrases from parse
		/**
		 * Returns a phrase in the users translation.
		 * Can interpolate variables into the string
		 * @param phrase
		 * @param variables
		 * @returns {*}
		 */
		tr : function(phrase, variables) {
			var self = this;
			if(!self.phrases[phrase])
			{
				self.unknownPhrases.push(phrase);
				console.log("phrase not found: ",phrase);
				self.phrases[phrase] = '{' + phrase + '}';
			}
			
			var vars = self.trGetContext();
			Object.assign(vars, variables);

			return _.template(self.phrases[phrase])(vars);
		},

		trPushContext: function(name, context)
		{
			this.trContexts.push({ name: name, variables: context });
		},

		trPopContext: function(name)
		{
			for (var i = this.trContexts.length - 1; i >= 0; i--) {
				if (this.trContexts[i].name === name) {
					this.trContexts.splice(i, 1);
					return;
				}
			}
		},

		trGetContext: function()
		{
			var vars = {};
			for (var i = 0; i < this.trContexts.length; i++) {
				Object.assign(vars, this.trContexts[i].variables);
			}
			return vars;
		},

		jsUcfirst: function (string) 
		{
		    return string.charAt(0).toUpperCase() + string.slice(1);
		},

		sound: SoundUtils
    };
});
