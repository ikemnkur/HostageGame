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
              <p class="diagram-caption">The queen begins separated. The rescue is complete when the king and queen reunite at home.</p>
            </div>
          </section>

          <section class="rules-section">
            <h2>🎯 Core Goal</h2>
            <div class="rule-callout">
              <p><strong>Strategic objective:</strong> recover your queen and score the stronger round position by the time the round resolves.</p>
              <ul>
                <li><strong>White home/castle square:</strong> A1</li>
                <li><strong>Black home/castle square:</strong> H8</li>
                <li><strong>Round resolution:</strong> after every Black move, the game evaluates score and outcome.</li>
              </ul>
            </div>
          </section>

          <section class="rules-section">
            <h2>🎲 Starting Position</h2>
            <p>The board uses the CSV opening layout below. The king starts in front, while the queen starts stranded in the opposite corner.</p>
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
                <p>No castling. The king is the escort piece for the rescue route and the key condition for keeping your queen protected.</p>
              </div>

              <div class="move-card move-card-compact">
                <h3>Queen</h3>
                <div class="piece-line"><span class="piece-chip white queen-chip">Q</span><span>Moves 1 square like a king.</span></div>
                <div class="piece-example example-grid">
                  <span></span><span class="diag-dot"></span><span></span>
                  <span class="diag-dot"></span><span class="example-center">Q</span><span class="diag-dot"></span>
                  <span></span><span class="diag-dot"></span><span></span>
                </div>
                <p>Queen can only capture on her own home side, and can only be captured on her own home side. On the enemy side and on the neutral diagonal (A1, B2, C3, D4, E5, F6, G7, H8), she is unarmed and cannot be captured.</p>
              </div>

              <div class="move-card move-card-compact">
                <h3>Pawn</h3>
                <div class="piece-line"><span class="piece-chip white">P</span><span>Moves like a rook, but only 1 square.</span></div>
                <div class="piece-example pawn-example">
                  <div class="pawn-orth">
                    <span class="move-dot center"></span>
                    <span class="move-dot up"></span>
                    <span class="move-dot down"></span>
                    <span class="move-dot left"></span>
                    <span class="move-dot right"></span>
                  </div>
                  <div class="pawn-capture">
                    <span class="move-dot diag up-left"></span>
                    <span class="move-dot diag up-right"></span>
                    <span class="example-center small">P</span>
                  </div>
                </div>
                <p>Pawn movement is orthogonal by 1 square. Pawn captures are diagonal by 1 square.</p>
              </div>

              <div class="move-card move-card-compact">
                <h3>Rook / Fort</h3>
                <div class="piece-line"><span class="piece-chip black">R</span><span>Slides orthogonally and can push one blocker.</span></div>
                <div class="piece-example example-row push-example">
                  <span class="example-start">R</span><span class="arrow">→</span><span class="blocker">X</span><span class="arrow">→</span><span class="push-target">□</span>
                </div>
                <div class="piece-example example-row push-example">
                  <span class="push-target">□</span><span class="arrow">→</span><span class="blocker">R</span><span class="arrow">→</span><span class="example-start">X</span>
                </div>
                <p>Rooks cannot capture and cannot be captured. A blocked move can push one piece forward if space remains.</p>
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
                <p>Add, remove, and reposition pieces until the rescue pattern feels right.</p>
              </div>
            </div>
          </section>

          <section class="rules-section">
            <h2>🏠 Home / Castle Square</h2>
            <p>Each side has exactly one home/castle square. Returning royals to home is central to scoring and end-state outcomes.</p>
            <div class="home-grid">
              <div class="home-box white-home">
                <strong>White home</strong>
                <span>A1</span>
              </div>
              <div class="home-box black-home">
                <strong>Black home</strong>
                <span>H8</span>
              </div>
            </div>
          </section>

          <section class="rules-section">
            <h2>👑 Win / Loss / Draw / Null</h2>
            <ol>
              <li><strong>Win:</strong> after round scoring, one side has higher points.</li>
              <li><strong>Loss:</strong> you finish the round with fewer points.</li>
              <li><strong>Draw:</strong> scores are equal, or both queens return home in the same round, or all royalty is eliminated.</li>
              <li><strong>Null:</strong> both queens are eliminated behind enemy lines before either has crossed back to its own side.</li>
            </ol>
          </section>

          <section class="rules-section">
            <h2>📊 Simple Score System</h2>
            <ul>
              <li><strong>+10</strong>: all your surviving royals are on your home square.</li>
              <li><strong>+5</strong>: your king reaches the enemy home square.</li>
              <li><strong>+3</strong>: your king is gone, but your queen has returned home.</li>
              <li><strong>-10</strong>: your king and queen are both eliminated.</li>
              <li><strong>-5</strong>: enemy king reaches your home square.</li>
              <li><strong>Special swing:</strong> when a side's king is dead and its queen is safely home, the opposing side can take an additional 3-point penalty depending on the board state.</li>
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
