define([
	'utils',
	'ColorParse',
	'jquery',
	'backbone'

], function (Utils, ColorParse) {
	return Backbone.View.extend({
		NAME: 'ChoosePseudoView',		

		initialize: function(options) {
			this.colorsapp = options.colorsapp;
			this.initials = this.colorsapp.getLeaderboardInitials();
			this.names = this.colorsapp.getLeaderboardNames();
		},

		render: function() {
			var self = this;

			self.$el.html(self.colorsapp.template("ChoosePseudoTemplate"));
			self.$name = self.$el.find('.pseudo .name');
			self.$shuffle = self.$el.find('.shuffle');
			self.$ok = self.$el.find('.ok');

			self.$shuffle.on('click', self.shuffle.bind(this));
			self.$ok.on('click', self.complete.bind(this));

			self.shuffle();
		},

		randomName: function() {
			var initialIndex = Math.floor(Math.random() * this.initials.length);
			var nameIndex = Math.floor(Math.random() * this.names.length);
			return this.initials.charAt(initialIndex) + ". " + this.names[nameIndex];
		},

		shuffle: function() {
			if (this.shuffleInterval) {
				this.$name.removeClass('shuffling');

				this.$shuffle.html(Utils.tr("choose_pseudo_again"));
				this.$ok.removeClass('hidden');

				Utils.sound.playSound('pseudo_stop');

				this.shuffleLoop.pause();
				this.shuffleLoop = null;

				clearInterval(this.shuffleInterval);
				this.shuffleInterval = null;
				return;
			}

			this.shuffleLoop = Utils.sound.playSound('peudo_shuffle', false, true);

			this.$name.addClass('shuffling');

			this.$shuffle.html(Utils.tr("choose_pseudo_stop"));
			this.$ok.addClass('hidden');

			this.shuffleInterval = setInterval(this.setName.bind(this), 50);
		},

		setName: function() {
			this.chosen = this.randomName();
			this.$name.html(this.chosen);
		},

		complete: function() {
			this.colorsapp.getUser()
				.set('leaderboard_name', this.chosen)
				.save();

			this.trigger("finished");
		}
	});
});