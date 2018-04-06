define([
    'ColorParse',
    'utils',
    'machina',
    'live/SessionStatus',
    'live/UserStatus',
    'views/ChallengeSendView',
    'views/ChallengeReceiveView',
    'views/LivePuzzleDetailView',
    'views/PuzzlePointsEndView',
    'jquery',
    'backbone'
], function (
    ColorParse, Utils, Machina, 
    SessionStatus, UserStatus, 
    ChallengeSendView, ChallengeReceiveView, LivePuzzleDetailView, PuzzlePointsEndView
) {

    var KeepAliveLiveInterval = 3 * 1000;
    var LiveOfflineTimeout = 15 * 1000;

    return Machina.Fsm.extend({
        
        app: null,
        user: null,
        live: null,

        initialState: 'Offline',

        opponent: null,
        opponentMonitor: null,

        session: null,
        puzzle: null,
        trial: null,

        inviteReceiveSub: null,
        sessionSub: null,
        trialSub: null,

        lastSessionStatus: null,
        trialNumber: 0,
        trialCount: 0,
        usedColorSetIds: null,
        picks: null,

        nextChatMessage: 0,

        challengeSendView: null,
        challengeReceiveView: null,
        puzzleDetailView: null,

        initialize: function(options)
        {
            this.app = options.app;
            this.user = options.user;
            this.live = options.live;

            this.live.on('connected_change', this.onConnectionChange.bind(this));
        },

        onConnectionChange: function(connected)
        {
            if (connected && this.state == 'Offline') {
                this.transition('Idle');

            } else if (!connected && this.state != 'Offline') {
                if (this.state == 'Idle') {
                    this.transition('Offline');
                } else {
                    this.transition('Error', 'WebSocket disconnect');
                }
            }
        },

        setSession: function(value)
        {
            var self = this;

            if (self.session === value)
                return;
            
            if (self.session != null) {
                self.subscribeToSession(null);
                self.lastSessionStatus = null;
            }

            self.session = value;

            if (self.session != null) {
                self.subscribeToSession(self.session);
            }
        },
        
        setOpponent: function(value)
        {
            var self = this;
            
            if (self.opponent === value)
                return;
            
            if (self.opponent != null && self.opponentMonitor != null) {
                self.live.offUserLeavesState(self.opponentMonitor);
                self.opponentMonitor = null;
                Utils.trPopContext('liveOpponent');
            }

            self.opponent = value;

            if (self.opponent != null) {
                Utils.trPushContext('liveOpponent', {
                    playerName: Utils.pseudo(self.app, self.opponent.id),
                    avatar: Utils.avatar(self.opponent)
                });
                // Check for opponent disconnect
                self.opponentMonitor = self.live.onUserLeavesState(
                    self.opponent.id, [UserStatus.Online, UserStatus.Playing], 
                    function() {
                        self.handle('onOpponentDisconnect');
                    }
                );
            }
        },

        setPuzzle: function(value)
        {
            var self = this;
            
            if (self.puzzle === value)
                return;
            
            if (self.puzzle != null) {
                self.cancelUpdateStatus();
            }

            self.puzzle = value;

            if (self.puzzle != null) {
                self.startUpdateStatus();
            }
        },

        setTrial: function(value)
        {
            var self = this;
            
            if (self.trial === value)
                return;
            
            if (self.trial != null && self.trialSub != null) {
                self.trialSub.unsubscribe();
                self.trialSub = null;
            }

            self.trial = value;

            if (self.trial != null) {
                var query = new ColorParse.Query("Trial")
                    .equalTo('objectId', self.trial.id);
                
                if (self.state == 'PuzzleSender') {
                    query.select('receiver_chat_messages', 'points');
                } else if (self.state == 'PuzzleReceiver') {
                    query.select('sender_chat_messages', 'sender_symbols');
                } else {
                    console.error('Set trial while in invalid state: ' + self.state);
                }

                self.nextChatMessage = 0;
                self.trialSub = query.subscribe()
                self.trialSub.on('update', function(trial) {
                    self.handle('trialUpdated', trial);
                    self.opponentOnChatMessage(trial);
                });
                self.trialSub.on('error', function(error) {
                    self.transition('Error', error);
                });
            }
        },

        setPuzzleDetailView: function(value)
        {
            var self = this;
            
            if (self.puzzleDetailView === value)
                return;
            
            if (self.puzzleDetailView != null) {
                self.puzzleDetailView.off('chat_message', self.puzzleViewOnMessage);
                self.puzzleDetailView.off('sender_symbols_changed', self.puzzleViewOnSenderSymbolsChanged);
                self.puzzleDetailView.off('receiver_color_chosen', self.puzzleViewOnReceiverColorChosen);
            }
            
            self.puzzleDetailView = value;
            
            if (self.puzzleDetailView != null) {
                self.puzzleDetailView.on('chat_message', self.puzzleViewOnMessage, self);
                self.puzzleDetailView.on('sender_symbols_changed', self.puzzleViewOnSenderSymbolsChanged, self);
                self.puzzleDetailView.on('receiver_color_chosen', self.puzzleViewOnReceiverColorChosen, self);
            }
        },

        subscribeToSession: function(session)
        {
            var self = this;

            if (self.sessionSub != null) {
                self.sessionSub.unsubscribe();
                self.sessionSub = null;
            }

            if (session != null) {
                var query = new ColorParse.Query("LiveSession")
                    .equalTo('objectId', session.id)
                    .include('puzzle', 'trial')
                    .select('status', 'puzzle', 'trial', 'timer_end');
                
                if (self.state == 'PuzzleSender') {
                    query.select('receiver_last_seen');
                } else if (self.state == 'PuzzleReceiver') {
                    query.select('sender_last_seen');
                }

                var sessionUpdated = function(session) {
                    var status = session.get('status');
                    if (self.lastSessionStatus != status) {
                        console.log('sessionStatusChanged: ' + self.lastSessionStatus + ' -> ' + status);
                        self.lastSessionStatus = status;
                        self.handle('sessionStatusChanged', session, status);
                    }
                    self.handle('sessionUpdated', session);
                };

                self.sessionSub = query.subscribe();
                self.sessionSub.on('update', sessionUpdated);
                self.sessionSub.on('error', function(error) {
                    self.transition('Error', error);
                });

                query.get(session.id)
                    .then(sessionUpdated);
            }
        },

        updateStatus: function()
        {
            var key;
            if (this.state == 'PuzzleSender') {
                key = 'sender_last_seen';
            } else if (this.state == 'PuzzleReceiver') {
                key = 'receiver_last_seen';
            } else {
                console.error('Trying to update status in invalid state: ' + this.state);
                return null;
            }

            this.session.set(key, new Date());
            this.session.save();
        },

        startUpdateStatus: function()
        {
            this.updateStatus();
            
            if (this.checkOpponentDisconnect()) {
                return;
            }

            this.cancelUpdateStatus();
            this.keepAliveTimeout = setTimeout(
                this.startUpdateStatus.bind(this), 
                KeepAliveLiveInterval
            );
        },

        cancelUpdateStatus: function()
        {
            if (this.keepAliveTimeout) {
                clearTimeout(this.keepAliveTimeout);
                this.keepAliveTimeout = null;
            }
        },

        checkOpponentDisconnect: function()
        {
            var key;
            if (this.state == 'PuzzleSender') {
                key = 'receiver_last_seen';
            } else if (this.state == 'PuzzleReceiver') {
                key = 'sender_last_seen';
            } else {
                console.error('Trying to check opponent disconnect in invalid state: ' + this.state);
                return true;
            }

            var lastSeen = this.session.get(key);
            var seenSince = Date.now() - lastSeen;
            if (seenSince > LiveOfflineTimeout) {
                this.handle('onOpponentDisconnect');
                return true;
            }

            return false;
        },

        startTimeout: function(session)
        {
            var self = this;

            var endTime = session.get('timer_end');
            var remaining = (endTime - new Date());

            self.stopTimeout();

            if (self.puzzleDetailView) {
                self.puzzleDetailView.startCountdown(remaining);
            }

            self.timeout = setTimeout(function() {
                self.handle('onTimeout');
            }, remaining);
        },

        stopTimeout: function()
        {
            if (this.puzzleDetailView) {
                this.puzzleDetailView.stopCountdown();
            }

            clearTimeout(this.timeout);
        },

        getTrialTimeLimit: function()
        {
            if (this.session.get('stress_mode')) {
                return this.app.getStressModeSyncTime();
            } else {
                return this.app.getLiveModeTimeout();
            }
        },

        showTutorial: function()
        {
            // First start an empty dummy tutorial and show actual
            // on the second time
            var tutorial = this.app.tutorial.startOnce('live_chat_icons_dummy');
            if (tutorial === false) {
                this.app.tutorial.startOnce('live_chat_icons')
            }
        },

        puzzleViewOnMessage: function(message)
        {
            if (this.trial == null) {
                console.error('Chat message created without trial set.');
                return;
            }

            var messageEntry = {
                message: message,
                time: new Date(),
                user: this.user.id
            };

            if (this.state == 'PuzzleSender') {
                this.trial.get('sender_chat_messages').push(messageEntry);
            } else if (this.state == 'PuzzleReceiver') {
                this.trial.get('receiver_chat_messages').push(messageEntry);
            } else {
                console.error('Trying to send chat message in invalid state: ' + this.state);
                return;
            }

            if (this.pendingChatMessage) return;

            this.pendingChatMessage = true;
            this.trial.save()
                .then(function() {
                    this.pendingChatMessage = false;
                });
        },

        opponentOnChatMessage: function(trial)
        {
            var messages;
            if (this.state == 'PuzzleSender') {
                messages = trial.get('receiver_chat_messages');
            } else if (this.state == 'PuzzleReceiver') {
                messages = trial.get('sender_chat_messages');
            } else {
                console.error('Received chat message in invalid state: ' + this.state);
                return;
            }

            var pending = messages.length - this.nextChatMessage;
            if (pending > 0) {
                if (pending > 1) {
                    console.warn('Received multiple chat message, just handling the latest.');
                }

                this.puzzleDetailView.receivedChatMessage(messages[messages.length - 1].message);
                this.nextChatMessage = messages.length;
            }
        },

        puzzleViewOnSenderSymbolsChanged: function(symbols)
        {
            if (this.trial == null) {
                console.error('Sender symbols changed without trial set.');
                return;
            }
            if (this.state != 'PuzzleSender') {
                console.error('Trying to send symbols in wrong state: ' + this.state);
                return;
            }
            
            this.handle('senderSymbolsChanged', symbols);
        },

        puzzleViewOnReceiverColorChosen: function(color)
        {
            if (this.state != 'PuzzleReceiver') {
                console.error('Trying to choose color in wrong state: ' + this.state);
                return;
            }

            this.handle('receiverColorChosen', color);
        },

        createTrial: function()
        {
            var self = this;
            return new Promise(function (resolve, reject) {
                var trial = self.app.createNewTrial(
                    self.puzzle,
                    {
                        step: self.trialNumber,
                        is_live: true,
                    },
                    self.usedColorSetIds
                );
                self.usedColorSetIds.push(trial.get('colors').id);

                self.trialNumber += 1;

                trial.save()
                    .then(function(trial) {
                        self.puzzle.get('trials').push(trial);
                        resolve(trial);
                    })
                    .catch(reject);
            });
        },

        updateSenderSymbols: function(symbols)
        {
            var self = this;

            if (!self.trial) {
                console.error('updateSenderSymbols: no trial set');
                return;
            }

            if (self.pendingSymbolsUpdate) {
                self.queuedSymbols = symbols;
            
            } else {
                self.pendingSymbolsUpdate = true;
                self.trial.set('sender_symbols', symbols);
                self.trial.save()
                    .then(function() {
                        self.pendingSymbolsUpdate = false;

                        if (self.queuedSymbols != null) {
                            var symbols = self.queuedSymbols;
                            self.queuedSymbols = null;
                            self.updateSenderSymbols(symbols);
                        }
                    });
            }
        },

        cleanUp: function()
        {
            // Clean up old state
            this.setTrial(null);
            this.setPuzzle(null);
            this.setSession(null);
            this.setOpponent(null);
        },

        states:
        {
            // ------ Offline ------

            Offline:
            {
                _onEnter: function()
                {
                    this.cleanUp();
                }
            },

            // ------ Idle ------

            Idle:
            {
                _onEnter: function()
                {
                    var self = this;
                    
                    // Clean up old state
                    self.cleanUp();

                    // Start subscribing for new invitations
                    var query = new ColorParse.Query("LiveSession")
                        .equalTo('invitee', self.user)
                        .equalTo('status', SessionStatus.Invited)
                        .greaterThan('createdAt', new Date())
                        .select('inviter');
        
                    self.inviteReceiveSub = query.subscribe();
                    self.inviteReceiveSub.on('create', function(session) {
                        if (self.state !== 'Idle') {
                            // It's possible for an update to come in even after
                            // transitioning to a new state and calling unsubscribe
                            return;
                        }
                        self.transition('ReceiveInvite', session);
                    });
                    self.inviteReceiveSub.on('error', function(error) {
                        // Ignore errors for invite subscriptions
                        console.error(error);
                    });
                },

                _onExit: function()
                {
                    if (self.inviteReceiveSub) {
                        self.inviteReceiveSub.unsubscribe();
                        self.inviteReceiveSub = null;
                    }
                },
            },



            // ------ Invite Sender ------

            SendInvite:
            {
                _onEnter: function(opponent)
                {
                    var self = this;
                    self.setOpponent(opponent);

                    // Create challenge view
                    self.challengeSendView = new ChallengeSendView({
                        colorsapp : self.app,
                        opponent : opponent,
                        onSend: function(stressMode) {
                            self.handle('sendInvite', stressMode);
                        },
                        onCancel: function() {
                            self.handle('cancelInvite');
                        }
                    });
                    self.challengeSendView.render();
                    self.app.ui.$el.append(self.challengeSendView.$el);
                },

                sendInvite: function(stressMode)
                {
                    var self = this;
        
                    var session = new ColorParse.Object('LiveSession', {
                        inviter: self.user,
                        invitee: self.opponent,
                        stress_mode: stressMode,
                        status: SessionStatus.Invited
                    });
                    session.save()
                        .then(function(session) {
                            self.setSession(session);
                            self.app.haveInteractionWithUser(self.opponent.id);
                            // Wait for sessionStatusChanged to be called
                        });
                },

                sessionStatusChanged: function(session)
                {
                    var status = session.get('status');

                    if (status === SessionStatus.Invited) {
                        // Caused by setting session

                    } else if (status === SessionStatus.Declined) {
                        this.app.promptTr("livesession_challenge_receiver_canceled");
                        this.transition('Idle');
                    
                    } else if (status === SessionStatus.Accepted) {
                        this.handle('invitationAccepted');

                    } else if (status === SessionStatus.Handoff) {
                        // Cuased by own handing off of Sender role
                    
                    } else if (status === SessionStatus.Started) {
                        this.transition('PuzzleReceiver');

                    } else {
                        this.transition('Error', 'Invalid session status "' + status + '" in state "' + this.state + '": Aborting session.');
                    }
                },

                cancelInvite: function()
                {
                    if (this.session) {
                        this.session.set('status', SessionStatus.Cancelled);
                        this.session.save();
                    }

                    this.transition('Idle');
                },

                onOpponentDisconnect: function()
                {
                    this.handle('cancelInvite');
        
                    this.app.promptTr("livesession_challenge_receiver_disconnect");
                },

                invitationAccepted: function()
                {
                    var self = this;

                    // Decide who will be sender
                    if (Math.random() < 0.5) {
                        // We'll be sender, start session
                        self.transition('PuzzleSender');
                    } else {
                        // Opponent will be sender, hand off
                        self.session.set('status', SessionStatus.Handoff);
                        self.session.save();
                        // Wait for sessionUpdate to be called
                    }
                },

                _onExit: function()
                {
                    if (this.challengeSendView) {
                        this.challengeSendView.destroy();
                        this.challengeSendView = null;
                    }
                },
            },



            // ------ Invite Recipient ------

            ReceiveInvite:
            {
                _onEnter: function(session)
                {
                    var self = this;
                    self.setSession(session);
                    self.setOpponent(self.session.get('inviter'));

                    // Create challenge view
                    self.challengeReceiveView = new ChallengeReceiveView({
                        colorsapp: self.app,
                        opponent: self.opponent,
                        stressMode: session.get('stress_mode'),
                        onResponse: function(response) {
                            self.handle('onResponse', response);
                        }
                    });
                    
                    self.challengeReceiveView.render();
                    self.app.ui.$el.append(self.challengeReceiveView.$el);
                },

                sessionStatusChanged: function(session)
                {
                    var status = session.get('status');

                    if (status === SessionStatus.Invited) {
                        // Caused by setting session

                    } else if (status === SessionStatus.Cancelled) {
                        this.handle('onCancelInvite');
                    
                    } else if (status === SessionStatus.Accepted) {
                        // Caused by own response

                    } else if (status === SessionStatus.Handoff) {
                        this.transition('PuzzleSender');

                    } else if (status === SessionStatus.Started) {
                        this.transition('PuzzleReceiver');

                    } else {
                        this.transition('Error', 'Invalid session status "' + status + '" in state "' + this.state + '": Aborting session.');
                    }
                },

                onResponse: function(response)
                {
                    var self = this;

                    self.session.set('status', response ? SessionStatus.Accepted : SessionStatus.Declined);
                    self.session.save();

                    if (response) {
                        self.app.haveInteractionWithUser(self.opponent.id);
                        // Wait for sessionStatusChanged to be called
                    } else {
                        self.transition('Idle');
                    }
                },

                onCancelInvite: function()
                {
                    this.app.promptTr("livesession_challenge_sender_canceled");
                    this.transition('Idle');
                },

                onOpponentDisconnect: function()
                {
                    this.app.promptTr("livesession_challenge_sender_disconnect");
                    this.transition('Error', 'Opponent disconnected.');
                },

                _onExit: function()
                {
                    if (this.challengeReceiveView) {
                        this.challengeReceiveView.destroy();
                        this.challengeReceiveView = null;
                    }
                },
            },



            // ------ Puzzle Sender Role ------

            PuzzleSender:
            {
                _onEnter: function()
                {
                    var self = this;
                    console.log('PuzzleSender._onEnter');

                    // Force re-subscription to add xxx_last_seen field
                    self.subscribeToSession(self.session);

                    var puzzle = self.app.createNewPuzzle({
                        cost: 0,
                        is_live: true,
                        receivers: [ self.opponent ],
                        stress_mode: self.session.get('stress_mode')
                    });
                    self.usedColorSetIds = [];

                    puzzle.save()
                        .then(function(puzzle) {
                            self.setPuzzle(puzzle);

                            self.trialNumber = 0;
                            self.trialCount = self.app.getTotalSteps();
                            return self.createTrial();
                        })
                        .then(function(trial) {
                            self.setTrial(trial);

                            var time = self.getTrialTimeLimit();
                            var endDate = new Date(Date.now() + time * 1000);
                            
                            self.startTime = Date.now();
                            self.pendingSymbolsUpdate = false;
                            self.queuedSymbols = null;

                            self.session.set('puzzle', puzzle);
                            self.session.set('trial', trial);
                            self.session.set('status', SessionStatus.Started);
                            self.session.set('timer_end', endDate);
                            self.session.save();

                            self.setPuzzleDetailView(new LivePuzzleDetailView({
                                colorsapp: self.app,
                                puzzle: puzzle,
                                opponent: self.opponent,
                                mode: 'sender',
                                stressMode: self.session.get('stress_mode')
                            }));
                            self.puzzleDetailView.render();
                            self.app.ui.pushView(self.puzzleDetailView, true);

                            self.puzzleDetailView.showTrial(self.trial);
                            self.startTimeout(self.session);

                            self.showTutorial();
                        });
                },

                senderSymbolsChanged: function(symbols)
                {
                    this.lastSenderSymbolChange = Date.now();
                    this.updateSenderSymbols(symbols);
                },

                sessionStatusChanged: function(session)
                {
                    var status = session.get('status');

                    if (status == SessionStatus.Invited) {
                        // Caused be re-subscription to session

                    } else if (status == SessionStatus.Started) {
                        // Caused by own starting the puzzle

                    } else if (status == SessionStatus.Picked) {
                        this.handle('continueToNextTrial');

                    } else if (status == SessionStatus.StressTimeUp) {
                        this.stopTimeout();
                        this.handle('continueToNextTrial');
                    
                    } else if (status == SessionStatus.Continue) {
                        // Caused by own continuing puzzle

                    } else if (status == SessionStatus.ReachedEnd) {
                        // Caused by own ending of puzzle

                    } else if (status == SessionStatus.Completed) {
                        this.handle('completePuzzle', session);

                    } else if (status == SessionStatus.TimeUp) {
                        this.handle('onTimeout');

                    } else {
                        this.transition('Error', 'Invalid session status "' + status + '" in state "' + this.state + '": Aborting session.');
                    }
                },

                continueToNextTrial: function()
                {
                    var self = this;

                    // Track time from start to last symbol change
                    var duration = 0;
                    if (self.lastSenderSymbolChange) {
                        duration = self.lastSenderSymbolChange - self.startTime;
                    }
                    self.trial.set('time_sender', duration / 1000);
                    self.lastSenderSymbolChange = null;

                    if (self.trialNumber < self.trialCount) {
                        self.createTrial()
                            .then(function(trial) {
                                self.setTrial(trial);

                                var time = self.getTrialTimeLimit();
                                var endDate = new Date(Date.now() + time * 1000);
                                
                                self.startTime = Date.now();

                                self.session.set('trial', trial);
                                self.session.set('status', SessionStatus.Continue);
                                self.session.set('timer_end', endDate);
                                self.session.save();
                                
                                self.puzzleDetailView.showTrial(self.trial);
                                self.startTimeout(self.session);
                            });
                    
                    } else {
                        self.puzzle.set('puzzle_end', new Date());
                        self.puzzle.save();

                        self.session.set('status', SessionStatus.ReachedEnd);
                        self.session.save();

                        // Wait for sessionStatusChanged to be called
                    }
                },

                completePuzzle: function(session)
                {
                    var self = this;

                    session.get('points').fetch()
                        .then(function(puzzlePointTracking) {
                            self.transition('Result', 'sender', puzzlePointTracking);
                        });
                },

                onTimeout: function()
                {
                    if (this.session.get('stress_mode')) {
                        this.session.set('status', SessionStatus.StressTimeUp);
                        this.session.save();

                    } else {
                        this.session.set('status', SessionStatus.TimeUp);
                        this.session.save();

                        this.puzzle.set('timeout_reached', true);
                        this.puzzle.save();
                        
                        this.app.promptTr('livesession_timeout_reached');
                        this.transition('Idle');
                    }
                },

                onOpponentDisconnect: function()
                {
                    this.app.promptTr("livesession_challenge_sender_disconnect");
                    this.transition('Error', 'Opponent disconnected');
                },

                _onExit: function()
                {
                    this.stopTimeout();

                    if (this.puzzleDetailView) {
                        this.app.ui.popView('LobbyView');
                        this.setPuzzleDetailView(null);
                    }
                },
            },



            // ------ Puzzle Receiver Role ------

            PuzzleReceiver:
            {
                _onEnter: function()
                {
                    var self = this;
                    console.log('PuzzleReceiver._onEnter');

                    // Force re-subscription to add xxx_last_seen field
                    self.subscribeToSession(self.session);

                    self.picks = [];

                    self.setPuzzle(self.session.get('puzzle'));
                    self.setTrial(self.session.get('trial'));

                    self.setPuzzleDetailView(new LivePuzzleDetailView({
                        colorsapp: self.app,
                        puzzle: self.puzzle,
                        opponent: self.opponent,
                        mode: 'receiver',
                        stressMode: self.session.get('stress_mode')
                    }));
                    self.puzzleDetailView.render();
                    self.app.ui.pushView(self.puzzleDetailView, true);

                    self.puzzleDetailView.showTrial(self.trial);
                    self.startTimeout(self.session);

                    self.showTutorial();
                },

                trialUpdated: function(trial)
                {
                    if (!this.startTime) {
                        this.startTime = Date.now();
                    }

                    this.puzzleDetailView.receiverTrialUpdate(trial);
                },

                sessionStatusChanged: function(session)
                {
                    var status = session.get('status');

                    if (status == SessionStatus.Picked) {
                        // Caused by own color pick

                    } else if (status == SessionStatus.StressTimeUp) {
                        this.stopTimeout();
                        // Wait for Continue

                    } else if (status == SessionStatus.Continue) {
                        this.handle('startNextTrial', session);
                    
                    } else if (status == SessionStatus.ReachedEnd) {
                        this.handle('completePuzzle');

                    } else if (status == SessionStatus.TimeUp) {
                        this.handle('onTimeout');

                    } else {
                        this.transition('Error', 'Invalid session status "' + status + '" in state "' + this.state + '": Aborting session.');
                    }
                },

                receiverColorChosen: function(pickedColor)
                {
                    var self = this;

                    this.stopTimeout();

                    var duration = 0;
                    if (self.startTime) {
                        duration = Date.now() - self.startTime;
                    }

                    var displayedColors = self.puzzleDetailView.getDisplayedColors();
                    var pick = self.app.trialAddPick(
                        self.trial, pickedColor, displayedColors, duration / 1000
                    );
                    self.picks.push(pick);
                    
                    self.trial.save();

                    self.session.set('status', SessionStatus.Picked);
                    self.session.save();
                },

                startNextTrial: function(session)
                {
                    this.startTime = null;

                    this.setTrial(session.get('trial'));
                    this.puzzleDetailView.showTrial(this.trial);
                    this.startTimeout(this.session);
                },

                completePuzzle: function()
                {
                    var self = this;

                    var correct = _.reduce(self.picks, function(sum, pick) {
                        sum += pick.correct_answer;
                    }, 0);

                    // The Puzzle object we got from the session subscription doesn't
                    // include the puzzle sender, so we have to get a new object
                    var query = new ColorParse.Query('Puzzle')
                        .include('sender')
                        .select('sender.objectId', 'is_live');
                    query.get(self.puzzle.id)
                        .then(function(puzzle) {
                            puzzle.set('completed', true);
                            return puzzle.save();
                        })
                        .then(function(puzzle) {
                            return self.app.saveQuota(self.picks, puzzle)
                        })
                        .then(function(puzzlePointTracking) {
                            self.session.set('points', puzzlePointTracking);
                            self.session.set('status', SessionStatus.Completed);
                            self.session.save();

                            self.transition('Result', 'receiver', puzzlePointTracking);
                        });
                },

                onTimeout: function()
                {
                    if (this.session.get('stress_mode')) {
                        this.session.set('status', SessionStatus.StressTimeUp);
                        this.session.save();

                    } else {
                        this.session.set('status', SessionStatus.TimeUp);
                        this.session.save();

                        this.puzzle.set('timeout_reached', true);
                        this.puzzle.save();
                        
                        this.app.promptTr('livesession_timeout_reached');
                        this.transition('Idle');
                    }
                },

                onOpponentDisconnect: function()
                {
                    this.app.promptTr("livesession_challenge_sender_disconnect");
                    this.transition('Error', 'Opponent disconnected');
                },

                _onExit: function()
                {
                    this.stopTimeout();

                    if (this.puzzleDetailView) {
                        this.app.ui.popView('LobbyView');
                        this.setPuzzleDetailView(null);
                    }
                },
            },



            // ------ Puzzle Result ------

            Result:
            {
                _onEnter: function(role, puzzlePointTracking)
                {
                    var self = this;

                    // Award points
                    var totalPoints = 0;
                    totalPoints += puzzlePointTracking.get(role + '_points_won');
                    totalPoints += puzzlePointTracking.get(role + '_points_bonus');

                    var increments = {};
                    increments[role + '_points'] = totalPoints;

                    self.app.incrementUserWallet(increments)
                        .then(function() {
                            self.app.checkRank();
                        });

                    // Show end view
                    self.puzzleEndView = new PuzzlePointsEndView({
                        colorsapp: self.app,
                        role: role,
                        puzzlePointTracking: puzzlePointTracking
                    });
                    self.puzzleEndView.render();

                    self.puzzleEndView.on("finished",function() {
                        self.transition('Idle');
                    });
                    
                    self.app.ui.pushView(self.puzzleEndView, true );

                    self.setTrial(null);
                    self.setPuzzle(null);
                    self.setSession(null);
                    self.setOpponent(null);
                },

                _onExit: function()
                {
                    if (this.puzzleEndView) {
                        this.app.ui.popView('LobbyView');
                        this.puzzleEndView = null;
                    }
                },
            },



            // ------ Error ------

            Error:
            {
                _onEnter: function(message)
                {
                    console.error(message);

                    if (this.session) {
                        if (this.session.get('status') == SessionStatus.Aborted) {
                            console.log('Opponent aborted session');
                        } else {
                            console.log('Aborting session after error');
                            this.session.set('status', SessionStatus.Aborted);
                            this.session.save();
                        }
                    }

                    this.transition(this.live.isConnected ? 'Idle' : 'Offline');
                },
            }
        },

        // ------ API ------

        sendInvite: function(opponent)
        {
            if (this.state === 'Idle') {
                this.transition('SendInvite', opponent);
            } else {
                console.error('Cannot send invite while in state "' + this.state + '".');
            }
        },
    });
});