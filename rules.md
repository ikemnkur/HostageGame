this was a online mulitplayer game for 8x8 checkboard. I want to use this project create a new game with a chess insired them. the game is called hostage, where the queen is held hostage behind enemy lines. the king is in front and has to get the queen back. The goal of this game is have the queen and king meet on the same square.

the pieces start other on opposite corners of the board
Here is the configuration as a CSV file:
#Start-----------------------------------------
BQueen,WKnight,WBishop,Wpawn,,,,
WBishop,WKing,Wpawn,,,,,
WKnight,Wpawn,,,,,,
Wpawn,,,,,,,
,,,,,,,Bpawn
,,,,,,Bpawn,BKnight
,,,,,Bpawn,BKing,BBishop
,,,,Bpawn,BBishop,BKnight,WQueen
#End-----------------------------------------

all pieces has the same movements except the pawns, rooks, and queen. 

Note to end the game and win the king and queen will have to move to the "Home" square and be together.

pawn movements
the pawn moves as a rook but only 1 sqaure
pawns captures on the diagonals only 1 square
a pawn can move on to the same sqaure as another, 2 on the same square
if a king is near the pawn can "promote into a rook or "fort"
pawn can not be captured as a pair, nor can they move as a pair, one must leave the union prior for both to move indiviually

rook
move as normal but they can not capture other pieces nor be captured them selves
rooks can also push a piece 1 square in the direction of travel if it is in the way and there are no other piece blocking the pushed piece.
rooks can demote into 2 pawns 

queen
queen moves a king piece (only one square) and starts off in the opposite corner, the queen can not capture or be captured, unless the king is captured first. since it is the target of the game its movement is heavily restricted

King can move 1 or 2 squares at a time - no castling since rooks dont exist unit promotion of pawns

Objective is to move the king and queen to the "home/castle square" queen where the hostage queen was orignally held. A1 for White or H8 for Black.

pawns can move onto each other squares and kings and queens can move on to each other's squares if that square is the castle/home square.

Win/lose/draw/null conditions - todo

I am still working on these but I want to be able to experiment with the game idea first

so in a addition to a game mode i need a expriemental mode where i can add/delete pieces, this is the main task. the actual PC vs Player game mode can be worked on and finished later, once I figure out some win/lose/draw/null conditions.

