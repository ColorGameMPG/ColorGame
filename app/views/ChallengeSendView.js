define([
	'ColorParse',
	'utils',
	'jquery',
	'backbone'

], function (ColorParse, Utils) {

	return Backbone.View.extend({
		NAME: 'ChallengeSendView',

		onSend: null,
		onCancel: null,

		initialize : function(options) {
			this.colorsapp = options.colorsapp;
			this.opponent = options.opponent; 	
			this.stressMode = this.colorsapp.stressMode && this.colorsapp.hasStressMode(this.opponent);
			this.onSend = options.onSend;
			this.onCancel = options.onCancel;
		},

		render : function() {
			var self = this;
			
			this.$el.html(this.colorsapp.template("ChallengeSendView"));

			this.$buttonChallenge 	= this.$el.find(".challenge");
			this.$buttonStressMode  = this.$el.find(".stressMode");
			this.$buttonCancel		= this.$el.find(".btn.cancel");
			
			
			this.$buttonStressMode.toggleClass('hidden', !this.stressMode);

			this.addEventListeners();
		},
		
		addEventListeners: function() {
			this.$buttonChallenge.one('click', this.handleChallengeOpponent.bind(this));
			this.$buttonStressMode.one('click', this.handleChallengeOpponent.bind(this));
			this.$buttonCancel.on('click', this.handleCancelChallenge.bind(this));
		},
		
		handleChallengeOpponent: function(event) {
			Utils.sound.playSound("confirm");
			
			this.showWaitingText();
			this.onSend(event.currentTarget == this.$buttonStressMode[0]);
		},
		
		handleCancelChallenge: function() {
			Utils.sound.playSound("confirm");
			
			this.onCancel();
		},
		
		showWaitingText: function() {
			this.$buttonChallenge.hide();
			this.$el.find(".introText").hide();
			this.$el.find(".waitingForJoin").show();
			// todo show loading wheel :) -> spin.js
		},

		// TODO: Upgrade -> Move to cloud function?
		pruneLiveSessions: function(){
			var self		= this;
			var query 		= new ColorParse.Query('LiveSession');
			var promises	= [];
			
			query.equalTo('sender', self.colorsapp.getUser());
			query.equalTo('receiver', self.opponent);
			
			query.find().then(function(liveSessions){
				_.each(liveSessions, function(session){
					promises.push(session.destroy());
				})
			});
			
			return promises;
		},
		
		destroy: function() {
			this.$buttonChallenge.off('click');
			this.$buttonCancel.off('click');
			
			this.$el.remove();
		}
	});
});
