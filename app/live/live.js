define([
    'parse',
    'ColorParse',
    'utils',
    'live/live_fsm',
    'live/UserStatus',
    'jquery',
    'backbone'
], function (Parse, ColorParse, Utils, LiveFSM, UserStatus) {

    // lastSeen is updated in these intervals for online presence in lobby
    var KeepAliveInterval = 10 * 1000;
    var IdleTimeout = 15 * 1000;
    var OfflineTimeout = 30 * 1000;

    // Name of views in which the user is considered available and not playing
    var OnlineViews = [
        'LobbyView'
    ];

    return Backbone.Model.extend({
        
        // ------ Fields ------

        app: null,
        user: null,

        fsm: null,

        isConnected: false,
        lastConnectionState: null,

        isAvailable: false,
        
        onlineUsers: new Map(),

        keepAliveTimeout: null,
        onlineSubscription: null,
        invitesSubscription: null,

        initialize: function(options)
        {
            var self = this;

            this.app = options.app;
            this.user = options.user;

            this.fsm = new LiveFSM({
                app: this.app,
                user: this.user,
                live: this
            });

            Parse.LiveQuery.on('error', function(e) {
                console.error(e);
            });

            this.on('connected_change', this.onConnectionChange);
            this.app.ui.on('show_view', this.onShowView.bind(this));

            // Momentarily set user to offline before setting olnine/playing
            // This way, if the app gets reloaded, interested user will get
            // an offline subscription update instead of skipping over the reload.
            this.user.set('status', UserStatus.Offline);
            this.user.save();

            this.connect();
        },

        // ------ Connection ------

        connect: function()
        {
            var self = this;

            // First create the live query client, otherwise we end up with multiple instances
            Parse.CoreManager
                .getLiveQueryController()
                .getDefaultLiveQueryClient()
                .then(function(c) {
                    self.liveQueryClient = c;
                    return Parse.LiveQuery.open();
                })
                .then(function() {
                    self.connectionCheckId = setInterval(self.connectionCheck.bind(self), 2000);
                })
                .catch(function(error) {
                    console.error(error);
                });
        },

        connectionCheck: function()
        {
            var state = this.liveQueryClient.state;

            var connected = (state == 'connected');
            if (this.isConnected != connected) {
                console.log('WebSocket connection status changed: ' + connected);
                this.isConnected = connected;
                this.trigger('connected_change', this.isConnected);
            }

            if (state != this.lastConnectionState) {
                if (state == 'reconnecting') {
                    this.app.promptTr('livessesion_offline');
                }
                this.lastConnectionState = state;
            }
        },

        onConnectionChange: function(connected)
        {
            if (connected && !this.onlineSubscription) {
                this.startOnlineSubscription();
            }

            if (connected) {
                this.startUpdateStatus();
            } else {
                this.goOffline();
            }
        },

        // ------ Own Online Status ------

        updateStatus: function()
        {
            this.user.set('status', this.isAvailable ? UserStatus.Online : UserStatus.Playing);
            this.user.set('lastSeen', new Date());
            return this.user.save();
        },

        startUpdateStatus: function()
        {
            var self = this;
            self.cancelUpdateStatus();
            if (self.app.offline) {
                self.keepAliveTimeout = setTimeout(
                    self.startUpdateStatus.bind(self), 
                    KeepAliveInterval
                );
            } else {
                self.updateStatus()
                    .then(function() {
                        self.cancelUpdateStatus();
                        self.keepAliveTimeout = setTimeout(
                            self.startUpdateStatus.bind(self), 
                            KeepAliveInterval
                        );
                    });
            }
        },

        cancelUpdateStatus: function()
        {
            if (this.keepAliveTimeout) {
                clearTimeout(this.keepAliveTimeout);
                this.keepAliveTimeout = null;
            }
        },

        onShowView: function(view)
        {
            this.isAvailable = OnlineViews.includes(view.NAME);
            if (this.isConnected) {
                this.updateStatus();
            }
        },

        goOffline: function()
        {
            this.cancelUpdateStatus();
            this.user.set('status', UserStatus.Offline);
            this.user.save();
        },

        onUserLeavesState: function(userId, statuses, callback)
        {
            var self = this;
            return setInterval(function() {
                var status = self.getStatusForUser(userId);
                if (!statuses.includes(status)) {
                    callback(userId, status);
                }
            }, 1000);
        },

        offUserLeavesState: function(intervalId)
        {
            clearInterval(intervalId);
        },

        // ------ Others' Online Status ----

        getStatusForUser: function(userOrId, ignoreOwnConnection)
        {
            if (ignoreOwnConnection === undefined) ignoreOwnConnection = false;
             
            if (!ignoreOwnConnection && !this.isConnected) {
                return UserStatus.Offline;
            }

            var user = userOrId;
            if (typeof userOrId === 'string') {
                user = this.onlineUsers.get(userOrId);
            }

            if (user === undefined) {
                return UserStatus.Offline;
            }

            var status = user.get('status');
            if (status === undefined || status === UserStatus.Offline) {
                return UserStatus.Offline;
            }

            var seenSince = Date.now() - user.get('lastSeen');
            if (seenSince > OfflineTimeout) {
                return UserStatus.Offline;
            } else if (seenSince > IdleTimeout) {
                return UserStatus.Idle;
            }

            return status;
        },

        startOnlineSubscription: function()
        {
            var self = this;

            var query = new ColorParse.Query("_User")
                .notEqualTo('objectId', self.user.id)
                .equalTo('moiety', self.user.get('moiety'))
                .notEqualTo('status', UserStatus.Offline)
                .greaterThan('lastSeen', new Date(Date.now() - OfflineTimeout))
                .select(['status', 'lastSeen']);

            var updateUser = function(user) {
                self.onlineUsers.set(user.id, user);
            };

            // Run a query to get current status
            query.find().then(function(result) {
                result.forEach(updateUser);
            });
            
            // Subscribe to be udpated when status changes
            self.onlineSubscription = query.subscribe();
            self.onlineSubscription.on('create', updateUser);
            self.onlineSubscription.on('update', updateUser);
            self.onlineSubscription.on('enter',  updateUser);
            self.onlineSubscription.on('leave',  updateUser);
            self.onlineSubscription.on('delete', updateUser);

            self.onlineSubscription.on('error', function(e) {
                console.error(e);
            });
        },
    });
});