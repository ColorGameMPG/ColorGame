define([
	'ColorParse',
	'utils',
	'jquery',
	'backbone'

], function (ColorParse, Utils) {

	return Backbone.View.extend({
		NAME: 'ChallengeReceiveView',

		onResponse: null,

		initialize : function(options) {
			this.colorsapp = options.colorsapp;
			this.opponent = options.opponent;
			this.onResponse = options.onResponse;
			this.stressMode = options.stressMode;
		},

		render : function() {
			var self = this;
			
			this.$el.html(self.colorsapp.template("ChallengeReceiveView", {
				stressMode: this.stressMode
			}));
			
			this.$buttonAccept = this.$el.find(".button_white.accept");
			this.$buttonCancel = this.$el.find(".btn.cancel");
			
			var audio = new Audio("app/assets/audio/notice_invite.mp3");
			audio.play();
			
			this.addEventListeners();
		},
		
		addEventListeners: function() {
			this.$buttonAccept.one('click', this.handleAcceptChallenge.bind(this) );
			this.$buttonCancel.one('click', this.handleCancelChallenge.bind(this));
		},
		
		handleAcceptChallenge: function() {
			Utils.sound.playSound("confirm");
			
			this.showWaitingText();
			this.onResponse(true);
		},
		
		handleCancelChallenge: function() {
			Utils.sound.playSound("confirm");
			
			this.onResponse(false);
		},

		showWaitingText: function() {
			this.$buttonAccept.hide();
			this.$el.find(".introText").hide();
			this.$el.find(".waitingForJoin").show();
			// todo show loading wheel :) -> spin.js
		},
		
		destroy: function() {
			this.$buttonAccept.off('click');
			this.$buttonCancel.off('click');
			
			this.$el.remove();
		}
	});
});