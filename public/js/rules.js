/* ─── Rules Page ──────────────────────────────────────── */

window.RulesPage = (() => {
  function render() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="rules-page">
        <div class="rules-header">
          <button id="back-btn" class="btn-secondary">← Back</button>
          <h1>How to Play Hostage</h1>
        </div>

        <div class="rules-content card">
          <section class="rules-hero">
            <div class="rules-hero-copy">
              <p class="rules-kicker">Chess-inspired rescue game</p>
              <p class="rules-summary">The queen starts stranded behind enemy lines. Escort and recover her, then return your royals to your home square while denying your opponent's plan.</p>
              <div class="rules-facts">
                <div class="rules-fact"><span>Board</span><strong>8×8 rhombus</strong></div>
                <div class="rules-fact"><span>Home square</span><strong>A1 for White / H8 for Black</strong></div>
                <div class="rules-fact"><span>Round check</span><strong>Resolved after Black moves</strong></div>
              </div>
            </div>

            <div class="rules-hero-diagram">
              <div class="diagram-labels">
                <span>White home</span>
                <span>Black home</span>
              </div>
              <div class="setup-diagram">
                <div class="diag-piece queen black" style="grid-column: 1; grid-row: 1;">Q</div>
                <div class="diag-piece king white" style="grid-column: 2; grid-row: 2;">K</div>
                <div class="diag-piece queen white" style="grid-column: 8; grid-row: 8;">Q</div>
                <div class="diag-piece king black" style="grid-column: 7; grid-row: 7;">K</div>
              </div>
              <p class="diagram-caption">The queen begins separated. The rescue is complete when the king and queen reunite at the home square/castle square.</p>
              <img src="/assets/images/Castle-location.png" alt="Hostage chess castle location diagram" class="rules-image rules-castle-image" />
            </div>
          </section>

          <section class="rules-section">
            <h2>🎯 Core Goal</h2>
            <div class="rule-callout">
              <p><strong>Strategic objective:</strong> Save your queen from captivity and place it back in your castle square, OR breach the enemy castle with your king, OR score the stronger position by the time the game ends.</p>
              <ul>
                <li><strong>White home/castle square:</strong> A8 (red)</li>
                <li><strong>Black home/castle square:</strong> H1 (blue)</li>
                <li><strong>Rescue condition:</strong> your queen is on your home square.</li>
                <li><strong>Breach condition:</strong> your king is on the enemy home square.</li>
                <li><strong>Round resolution:</strong> Usually after every Black move, the game engine evaluates score and game outcome.</li>
              </ul>
            </div>
          </section>

          <section class="rules-section">
            <h2>🎲 Starting Position</h2>
            <p>The board uses the CSV opening layout below. The king starts in front, while the queen starts stranded in the opposite corner.</p>
            <img src="/assets/images/starting-position.png" alt="Starting position diagram" class="rules-image" />
            <div class="csv-block">
              <code>BQueen,WKnight,WBishop,Wpawn,Wpawn,,,,<br>
WBishop,WKing,Wpawn,Wpawn,,,,<br>
WKnight,Wpawn,,,,,,<br>
Wpawn,Wpawn,,,,,,Bpawn,<br>
Wpawn,,,,,,Bpawn,Bpawn<br>
,,,,,,Bpawn,BKnight<br>
,,,,Bpawn,Bpawn,BKing,BBishop<br>
,,,Bpawn,Bpawn,BBishop,BKnight,WQueen</code>
            </div>
          </section>

          <section class="rules-section">
            <h2>♟️ Piece Examples</h2>
            <div class="move-types">
              <div class="move-card move-card-compact">
                <h3>King</h3>
                <div class="piece-line"><span class="piece-chip white">K</span><span>Moves 1 or 2 squares.</span></div>
                <div class="piece-example example-row">
                  <span class="example-start">K</span><span class="arrow">→</span><span class="example-step">1</span><span class="arrow">→</span><span class="example-step">2</span>
                </div>
                <p>No castling here, because well there arent rooks to "castle" with. The king is the escort piece for the queen rescue, and is the key condition for "castling" with the queen on the castle/home square. it the most powerful piece for keeping your queen protected.</p>
              </div>

              <div class="move-card move-card-compact">
                <h3>Queen</h3>
                <div class="piece-line"><span class="piece-chip white queen-chip">Q</span><span>Moves 1 square like a king.</span></div>
              
                <p>Queen can only capture on her own home side. She is initially uncapturable on enemy/neutral squares, but once she has crossed onto her own side at least once, she becomes capturable from then on regardless of where she stands.</p>
              </div>

              <div class="move-card move-card-compact">
                <h3>Pawn</h3>
                <div class="piece-line"><span class="piece-chip white">P</span><span>Moves like a rook, but only 1 square.</span></div>
               
                <p>Pawn movement is orthogonal by 1 square. Pawn captures are diagonal by 1 square. Pairing pawns can form forts. A pawn that breaches the enemy castle square auto-promotes to a knight. A paired pawn (fort state) on the enemy castle square promotes to a bishop.</p>
              </div>

              <div class="move-card move-card-compact">
                <h3>Rook</h3>
                <div class="piece-line"><span class="piece-chip black">R</span><span>Slides orthogonally and can push one blocker.</span></div>
                <div class="piece-example example-row push-example">
                  <span class="example-start">R</span><span class="arrow">→</span><span class="blocker">X</span><span class="arrow">→</span><span class="push-target">□</span>
                </div>
                <div class="piece-example example-row push-example">
                  <span class="push-target">□</span><span class="arrow">→</span><span class="blocker">R</span><span class="arrow">→</span><span class="example-start">X</span>
                </div>
                <p>Rooks cannot capture and are normally uncapturable. A blocked move can push the blocking piece forward one square if space remains in the direction of travel.</p>
                <p> Rooks can demote into forts, select the demote button.</p>
                 <p> If the rook breaches the enemy castle it auto-promotes to a queen.</p>
               
              </div>

              <div class="move-card move-card-compact">
                <h3>Fort</h3>
                <div class="piece-line"><span class="piece-chip black">F</span><span>Static Piece (no movement)</span></div>
                
                <p> Two adjacent pawns of the same color can move to the same square to form a fort, which is static and cannot move and is normally uncapturable like rooks. Forts can revert by selecting a free square to demote the fort back into individual pawns.</p>
                <p>Forts can be used to create strategic barriers and control key squares, but they can also be a liability if they block your own rescue routes or piece coordination.</p>
                <p>If a king is adjacent to a fort, the fort can elect to promote into a rook on the king's turn, select the promote button. Doing so gains the ability to move and push but loses the static defense. This can be a powerful tactical option for breaking through enemy lines or creating dynamic threats, but it also exposes the fort to capture and removes its ability to serve as a protective barrier for your king.</p>
                <p>Balance rule: any piece standing on either castle square can be captured, including rooks and forts/paired pawns.</p>
               
              </div>

              <div class="move-card move-card-compact">
                <h3>Bishop / Knight</h3>
                <div class="piece-line"><span class="piece-chip black">B</span><span>Bishop slides diagonally any distance.</span></div>
                <div class="piece-line"><span class="piece-chip black">N</span><span>Knight uses standard chess L-jumps.</span></div>
                <p>Use these pieces to create pressure, forks, and rescue-lane interference.</p>
              </div>
            </div>
          </section>

          <section class="rules-section rules-highlight">
            <h2>🧪 Experimental Mode Controls</h2>
            <p><strong>Experimental Mode</strong> is the official sandbox for setup testing and tactical drills.</p>
            <div class="lab-grid">
              <div class="lab-card">
                <h3>Desktop</h3>
                <p>Shift+click a piece to delete it.</p>
              </div>
              <div class="lab-card">
                <h3>Mobile</h3>
                <p>Triple-tap a piece to delete it.</p>
              </div>
              <div class="lab-card">
                <h3>Workflow</h3>
                <p>Add, remove, and reposition pieces to simulate different in-game scenarios.</p>
              </div>
            </div>
          </section>

          <section class="rules-section">
            <h2>🏠 Home / Castle Square</h2>
            <p>Each side has exactly one home/castle square. Returning royals to home is central to scoring and the end-game outcome.</p>
            <div class="home-grid">
              <div class="home-box white-home">
                <strong>White home</strong>
                <span>A8 (red tinted square)</span>
              </div>
              <div class="home-box black-home">
                <strong>Black home</strong>
                <span>H1 (blue tinted square)</span>
              </div>
            </div>
          </section>

          <section class="rules-section">
            <h2>👑 Win / Loss / Draw / Null</h2>
            <ol>
              <li><strong>Win:</strong> after round scoring, one side has higher points.</li>
              <li><strong>Loss:</strong> you finish the round with fewer points.</li>
              <li><strong>Draw:</strong> scores are equal, or both queens return home in the same round, or all royalty is eliminated.</li>
              <li><strong>Null:</strong> both queens are eliminated behind enemy lines before either has crossed back to its own side. Or Abandonment/Abort</li>
            </ol>
          </section>

          <section class="rules-section">
            <h2>📊 Simple Score System</h2>
            <p>At round resolution, each player scores points based on the rank/number of their pieces. The player with the higher score wins the round.</p>

            <PieceValueTable />
              <p>Points are awarded for surviving pieces, with the queen and king being the most valuable. The neutral pawn in the center is worth 1 point to each side if it survives, but cannot be captured or moved.</p>  
              Pawns: 1.5 point each<br>
              Knights: 3 points each<br>
              Bishops: 4 points each<br>
              Forts (paired pawns): 4 points each<br>
              Rooks: 6 points each<br>
              Queen: 10 points<br>
              King: 15 points<br>
          </section>

          <section class="rules-section">
            <h2>⚖️ Bonus / Penalty Scoring</h2>

            Bonus points and penalties are applied based on key strategic conditions related to the rescue and castling/home-return:
            <ul>
             
              <li><strong>+10</strong>: all your surviving royals are on your home square.</li>
              <li><strong>+5</strong>: your king reaches the enemy home square.</li>
              <li><strong>+3</strong>: your king is gone, but your queen has returned home.</li>
              <li><strong>-10</strong>: your king and queen are both eliminated.</li>
              <li><strong>-5</strong>: enemy king reaches your home square.</li>
              <li><strong>-3</strong>: enemy king is dead, but enemy queen is safely castled/home.</li>
              <li><strong>0</strong>: all other scenarios, including draws and nulls.</li>

            </ul>
          </section>

          <section class="rules-section">
            <h2>💡 Practical Play Notes</h2>
            <ul>
              <li>Protect your king first: queen safety and capture rights depend on king survival.</li>
              <li>Use rook pushes to create lanes and disrupt enemy escorts.</li>
              <li>Coordinate pawn diagonals for tactical captures around the neutral band.</li>
              <li>Track round timing and clock format (including negative increment controls like 3-1).</li>
            </ul>
          </section>

          <div class="rules-footer">
            <button id="start-playing-btn">Go to Lobby</button>
            <button id="try-practice-btn" class="btn-secondary">Open Experimental Mode</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('back-btn').addEventListener('click', () => {
      const user = getUser();
      window.App.navigate(user ? '/lobby' : '/');
    });
    document.getElementById('start-playing-btn').addEventListener('click', () => {
      const user = getUser();
      window.App.navigate(user ? '/lobby' : '/');
    });
    document.getElementById('try-practice-btn').addEventListener('click', () => {
      window.App.navigate('/experimental-mode');
    });
  }

  function getUser() {
    try { return JSON.parse(localStorage.getItem('hostage_user') || localStorage.getItem('HostageChess_user')); } catch { return null; }
  }

  function cleanup() {
    // No cleanup needed for rules page
  }

  return { render, cleanup };
})();
