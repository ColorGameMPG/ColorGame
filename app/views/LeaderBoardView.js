define([
	'ColorParse',
	'utils',
	'jquery',
	'backbone'

], function (ColorParse, Utils) {
	return Backbone.View.extend({
		NAME: 'LeaderBoardView',

		initialize : function(options) {
			this.colorsapp = options.colorsapp;
		},
		
		render : function() {
			this.getUserList();
		},
		
		getUserList: function() {
			var self = this;
			var query = new ColorParse.Query('_User');
			// TODO: What happens with more than 1000 users?
			query.notEqualTo('username', 'admin@admin.com');
			query.include('wallet');
			query.equalTo('moiety', self.colorsapp.getUser().get("moiety"));
			query.limit(1000); // Parse maximum
			query.find().then( function(users) {
				self.renderList(users);
			});
		},
		
		renderList: function( users ){

			var self = this;
			var leaderBoard = [];
			var userItem;
			
			_.each(users, function(user, i){
				userItem 				= {};
				userItem.user 			= user;
				userItem.isme 			= (user.id == self.colorsapp.getUser().id);
				userItem.totalPoints	= user.get('wallet') ? user.get('wallet').get('sender_points') + user.get('wallet').get('receiver_points') : 0;
				userItem.coverName 		= user.get('leaderboard_name') || Utils.leaderboardPseudo(self.colorsapp, user.id);
				leaderBoard.push(userItem);
			});
			
			leaderBoard.sort(function(a, b){
				return b.totalPoints - a.totalPoints;
			});
			
			this.$el.html(this.colorsapp.template("LeaderBoardViewTemplate", {
				leaderBoard: leaderBoard,
			}));
		}
	});
});