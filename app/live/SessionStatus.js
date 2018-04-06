// Possible statuses for a LiveSession
define({
    // ------ Invitation Phase ------

    // Initial state, invitation has been sent
    Invited: 'invited',
    // Invitation has been cancelled by sender
    Cancelled: 'cancelled',
    // Invitation was declined by receiver
    Declined: 'declined',
    // Inviation was accepted by receiver
    Accepted: 'accepted',
    // Invitator hands off sender role to invitee
    Handoff: 'handoff',

    // ------ Puzzle Phase ------

    // Invitator/Invitee has created puzzle and first trial
    Started: 'started',
    // Receiver has picked color
    Picked: 'picked',
    // Time up in stress mode -> continue to next trial
    StressTimeUp: 'stress_timeup',
    // Sender has created next trial
    Continue: 'continue',
    // Reached end of puzzle, let reciver tally up points
    ReachedEnd: 'reached_end',

    // Live puzzle has been completed successfully
    Completed: 'completed',
    // Receiver took too long to answer
    TimeUp: 'timeup',
    // Live puzzle has been aborted
    Aborted: 'aborted'
});