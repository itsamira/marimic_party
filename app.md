build a realtime multiplayer webapp using Node.js/socket.io or firebase where one user is the host and others are players. 
player scan a qr code and then enter their name to join.
there is no limit on the number of player that can join.

# game set
## The host screen
The host screen displays a live dashboard showing which player picked which number. 
They can click a button "start" and the live dashboard is active.

## The player screen
they are presented with a selection for number 0 to 10.

# Rule
once a number is picked by any player, it becomes disabled/unavailable for anyone else.
there is a 20 seconds countdown, after that all numbers are disabled whether it has been picked or not.


