/* ─── Board Renderer (Canvas) ─────────────────────────── */

window.BoardRenderer = (() => {
  const PIECE_SPRITE_BASE = '/assets/pieces-basic-svg';
  const PIECE_SPRITES = {
    white: {
      king: `${PIECE_SPRITE_BASE}/king-w.svg`,
      queen: `${PIECE_SPRITE_BASE}/queen-w.svg`,
      bishop: `${PIECE_SPRITE_BASE}/bishop-w.svg`,
      knight: `${PIECE_SPRITE_BASE}/knight-w.svg`,
      pawn: `${PIECE_SPRITE_BASE}/pawn-w.svg`,
      rook: `${PIECE_SPRITE_BASE}/rook-w.svg`,
      fort: `${PIECE_SPRITE_BASE}/rook-w.svg`,
    },
    black: {
      king: `${PIECE_SPRITE_BASE}/king-b.svg`,
      queen: `${PIECE_SPRITE_BASE}/queen-b.svg`,
      bishop: `${PIECE_SPRITE_BASE}/bishop-b.svg`,
      knight: `${PIECE_SPRITE_BASE}/knight-b.svg`,
      pawn: `${PIECE_SPRITE_BASE}/pawn-b.svg`,
      rook: `${PIECE_SPRITE_BASE}/rook-b.svg`,
      fort: `${PIECE_SPRITE_BASE}/rook-b.svg`,
    },
  };
  const spriteCache = new Map();

  const COLORS_MAP = {
    white:  '#f5f5f5',
    black:  '#1e1e1e',
  };
  const LIGHT = '#f0d9b5';
  const DARK  = '#b58863';
  const CENTER_HIGHLIGHT = 'rgba(233, 69, 96, 0.25)';
  const SELECT_HIGHLIGHT = 'rgba(255, 255, 255, 0.35)';
  const MOVE_HIGHLIGHT   = 'rgba(100, 255, 100, 0.4)';
  const WHITE_CASTLE_HIGHLIGHT = 'rgba(239, 68, 68, 0.28)';
  const BLACK_CASTLE_HIGHLIGHT = 'rgba(59, 130, 246, 0.28)';
  const LAST_MOVE_FROM_HIGHLIGHT = 'rgba(209, 213, 219, 0.38)';
  const LAST_MOVE_TO_HIGHLIGHT = 'rgba(75, 85, 99, 0.48)';
  const LAST_MOVE_BORDER = 'rgba(250, 204, 21, 0.95)';

  function create(container, opts = {}) {
    const size = opts.size || 480;
    const cellSize = size / 8;
    let diamond45 = !!opts.diamond45;
    const diamondScale = opts.diamondScale || 0.7;
    const pieceRotationDeg = Number.isFinite(opts.pieceRotationDeg) ? opts.pieceRotationDeg : 0;
    const pieceRotationRad = pieceRotationDeg * (Math.PI / 180);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    if (!container.style.position) container.style.position = 'relative';

    const clickIndicator = document.createElement('div');
    clickIndicator.style.position = 'absolute';
    clickIndicator.style.left = '10px';
    clickIndicator.style.bottom = '10px';
    clickIndicator.style.padding = '4px 8px';
    clickIndicator.style.borderRadius = '6px';
    clickIndicator.style.background = 'rgba(25, 25, 25, 0.65)';
    clickIndicator.style.color = 'rgba(245, 245, 245, 0.92)';
    clickIndicator.style.font = '600 12px Segoe UI, sans-serif';
    clickIndicator.style.letterSpacing = '0.02em';
    clickIndicator.style.pointerEvents = 'none';
    clickIndicator.style.opacity = '0';
    clickIndicator.style.transition = 'opacity 180ms ease';
    clickIndicator.style.zIndex = '3';
    container.appendChild(clickIndicator);

    let board = HostageEngine.createEmptyBoard();
    let selectedCell = null;
    let legalMoves = [];
    let onCellClick = null;
    let rotation = 0; // 0, 90, 180, 270 degrees
    let lastMoveFrom = null;
    let lastMoveTo = null;

    // ─── Animation state ──────────────────────────────────
    let animating = false;
    let animPiece = null;       // { color, value } being slid
    let animFromDisplay = null; // [displayR, displayC] start
    let animToDisplay = null;   // [displayR, displayC] end
    let animProgress = 0;       // 0→1
    let animStartTime = 0;
    let animDuration = 500;     // ms
    let animFrameId = null;
    let animHideLogical = null; // [logR, logC] to hide from static draw (source square)
    let fadingPieces = [];      // [{logR, logC, opacity, piece}] pieces fading out
    let fadeStartTime = 0;
    let fadeDuration = 400;     // ms for fade-out
    let clickIndicatorTimer = null;

    function getSpriteForPiece(piece) {
      if (!piece || !piece.type || !piece.color) return null;
      const colorMap = PIECE_SPRITES[piece.color];
      if (!colorMap) return null;
      const src = colorMap[piece.type];
      if (!src) return null;

      let img = spriteCache.get(src);
      if (!img) {
        img = new Image();
        img.src = src;
        img.addEventListener('load', () => draw());
        spriteCache.set(src, img);
      }

      if (!img.complete || img.naturalWidth === 0) return null;
      return img;
    }

    function withBoardTransform(fn) {
      if (!diamond45) {
        fn();
        return;
      }
      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.rotate(Math.PI / 4);
      ctx.scale(diamondScale, diamondScale);
      ctx.translate(-size / 2, -size / 2);
      fn();
      ctx.restore();
    }

    function pointToDisplayCell(px, py) {
      let x = px;
      let y = py;

      if (diamond45) {
        const cx = x - size / 2;
        const cy = y - size / 2;
        const sx = cx / diamondScale;
        const sy = cy / diamondScale;
        const cos = Math.cos(-Math.PI / 4);
        const sin = Math.sin(-Math.PI / 4);
        const rx = sx * cos - sy * sin;
        const ry = sx * sin + sy * cos;
        x = rx + size / 2;
        y = ry + size / 2;
      }

      const displayC = Math.floor(x / cellSize);
      const displayR = Math.floor(y / cellSize);

      if (displayR < 0 || displayR > 7 || displayC < 0 || displayC > 7) return null;
      return [displayR, displayC];
    }

    // Transform logical board coordinates to display coordinates based on rotation
    function transformCoords(r, c) {
      switch(rotation) {
        case 0:   return [r, c];
        case 90:  return [c, 7 - r];
        case 180: return [7 - r, 7 - c];
        case 270: return [7 - c, r];
        default:  return [r, c];
      }
    }

    // Transform display coordinates to logical board coordinates
    function inverseTransformCoords(r, c) {
      switch(rotation) {
        case 0:   return [r, c];
        case 90:  return [7 - c, r];
        case 180: return [7 - r, 7 - c];
        case 270: return [c, 7 - r];
        default:  return [r, c];
      }
    }

    function toSquareLabel(r, c) {
      return `${String.fromCharCode(65 + c)}${8 - r}`;
    }

    function showClickIndicator(r, c) {
      clickIndicator.textContent = `Clicked: ${toSquareLabel(r, c)}`;
      clickIndicator.style.opacity = '1';
      if (clickIndicatorTimer) clearTimeout(clickIndicatorTimer);
      clickIndicatorTimer = setTimeout(() => {
        clickIndicator.style.opacity = '0';
        clickIndicatorTimer = null;
      }, 2000);
    }

    // ─── Draw a single piece at pixel (cx, cy) ──────────
    function drawPieceAt(piece, cx, cy, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      const radius = cellSize * 0.35;
      const hasType = typeof piece.type === 'string' && piece.type.length > 0;

      // Apply an extra 45deg CCW rotation in rhombus mode around each piece center.
      const effectivePieceRotationRad = pieceRotationRad + (diamond45 ? -Math.PI / 4 : 0);
      if (effectivePieceRotationRad !== 0) {
        ctx.translate(cx, cy);
        ctx.rotate(effectivePieceRotationRad);
        ctx.translate(-cx, -cy);
      }

      if (hasType) {
        const sprite = getSpriteForPiece(piece);
        if (sprite) {
          const spriteSize = cellSize * 0.84;
          ctx.drawImage(sprite, cx - spriteSize / 2, cy - spriteSize / 2, spriteSize, spriteSize);

          if (piece.sharedRoyalPair && piece.sharedWith) {
            const sharedSprite = getSpriteForPiece(piece.sharedWith);
            const badgeSize = cellSize * 0.42;
            const bx = cx + cellSize * 0.2;
            const by = cy + cellSize * 0.2;
            ctx.beginPath();
            ctx.arc(bx, by, badgeSize * 0.52, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
            ctx.fill();
            if (sharedSprite) {
              ctx.drawImage(sharedSprite, bx - badgeSize / 2, by - badgeSize / 2, badgeSize, badgeSize);
            } else {
              ctx.fillStyle = '#fff';
              ctx.font = `700 ${Math.floor(cellSize * 0.2)}px Segoe UI`;
              ctx.textAlign = 'center';
              const effectivePieceRotationRad = pieceRotationRad + (diamond45 ? -Math.PI / 4 : 0);
              ctx.fillText('Q', bx, by + 0.5);
            }
          }

          if (piece.paired) {
            ctx.beginPath();
            ctx.arc(cx + radius * 0.62, cy - radius * 0.62, cellSize * 0.11, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(233, 69, 96, 0.92)';
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = `700 ${Math.floor(cellSize * 0.16)}px Segoe UI`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('2', cx + radius * 0.62, cy - radius * 0.62 + 0.5);
          }

          ctx.restore();
          return;
        }
      }

      // Shadow
      ctx.beginPath();
      ctx.arc(cx + 2, cy + 2, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fill();

      // Piece body
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = COLORS_MAP[piece.color] || '#888';
      ctx.fill();

      // Shine
      ctx.beginPath();
      ctx.arc(cx - radius * 0.25, cy - radius * 0.25, radius * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fill();

      // Border
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();

      if (hasType) {
        const labelMap = {
          king: 'K',
          queen: 'Q',
          bishop: 'B',
          knight: 'N',
          pawn: 'P',
          rook: 'R',
          fort: 'F',
        };
        const label = labelMap[piece.type] || '?';
        ctx.fillStyle = piece.color === 'white' ? '#101010' : '#f2f2f2';
        ctx.font = `700 ${Math.floor(cellSize * 0.34)}px Segoe UI`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cx, cy + 1);

        if (piece.sharedRoyalPair) {
          ctx.beginPath();
          ctx.arc(cx + radius * 0.68, cy + radius * 0.68, cellSize * 0.12, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.72)';
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = `700 ${Math.floor(cellSize * 0.18)}px Segoe UI`;
          ctx.fillText('Q', cx + radius * 0.68, cy + radius * 0.68 + 0.5);
        }

        if (piece.paired) {
          ctx.beginPath();
          ctx.arc(cx + radius * 0.62, cy - radius * 0.62, cellSize * 0.11, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(233, 69, 96, 0.92)';
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = `700 ${Math.floor(cellSize * 0.16)}px Segoe UI`;
          ctx.fillText('2', cx + radius * 0.62, cy - radius * 0.62 + 0.5);
        }

        ctx.restore();
        return;
      }

      // Value dots
      if (piece.value) {
        const dotRadius = cellSize * 0.045;
        const dotColor = 'rgba(80, 80, 80, 0.7)';
        if (piece.value === 1) {
          ctx.beginPath();
          ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
          ctx.fillStyle = dotColor;
          ctx.fill();
        } else if (piece.value === 2) {
          ctx.beginPath();
          ctx.arc(cx - radius * 0.3, cy, dotRadius, 0, Math.PI * 2);
          ctx.fillStyle = dotColor;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(cx + radius * 0.3, cy, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        } else if (piece.value === 3) {
          ctx.beginPath();
          ctx.arc(cx, cy - radius * 0.35, dotRadius, 0, Math.PI * 2);
          ctx.fillStyle = dotColor;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(cx - radius * 0.3, cy + radius * 0.2, dotRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(cx + radius * 0.3, cy + radius * 0.2, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    function drawSquareNumber(logicalR, logicalC, x, y) {
      const squareLabel = toSquareLabel(logicalR, logicalC);
      const labelX = x + cellSize * 0.08;
      const labelY = y + cellSize * 0.06;
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#6b7280';
      ctx.font = `800 ${Math.max(15, Math.floor(cellSize * 0.2))}px Segoe UI`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      if (diamond45) {
        ctx.translate(labelX, labelY);
        ctx.rotate(-45 * Math.PI / 180);
        ctx.fillText(squareLabel, -8, 5);
      } else {
        ctx.fillText(squareLabel, labelX, labelY);
      }
      ctx.restore();
    }

    function draw() {
      ctx.clearRect(0, 0, size, size);

      withBoardTransform(() => {
        for (let displayR = 0; displayR < 8; displayR++) {
          for (let displayC = 0; displayC < 8; displayC++) {
            const x = displayC * cellSize;
            const y = displayR * cellSize;

            // Get logical coordinates from display coordinates
            const [logicalR, logicalC] = inverseTransformCoords(displayR, displayC);

            // Board square color
            ctx.fillStyle = (displayR + displayC) % 2 === 0 ? LIGHT : DARK;
            ctx.fillRect(x, y, cellSize, cellSize);

            // Castle/home square highlights
            const whiteHome = HostageEngine.CASTLE_HOME?.white;
            const blackHome = HostageEngine.CASTLE_HOME?.black;
            if (whiteHome && logicalR === whiteHome[0] && logicalC === whiteHome[1]) {
              ctx.fillStyle = WHITE_CASTLE_HIGHLIGHT;
              ctx.fillRect(x, y, cellSize, cellSize);
            }
            if (blackHome && logicalR === blackHome[0] && logicalC === blackHome[1]) {
              ctx.fillStyle = BLACK_CASTLE_HIGHLIGHT;
              ctx.fillRect(x, y, cellSize, cellSize);
            }

            // // Center highlight
            // if (HostageEngine.isCenter(logicalR, logicalC)) {
            //   ctx.fillStyle = CENTER_HIGHLIGHT;
            //   ctx.fillRect(x, y, cellSize, cellSize);
            //   // Dashed border
            //   ctx.strokeStyle = 'rgba(233, 69, 96, 0.5)';
            //   ctx.lineWidth = 2;
            //   ctx.setLineDash([4, 4]);
            //   ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
            //   ctx.setLineDash([]);
            // }

            // Last move markers (old square light gray, new square dark gray)
            if (lastMoveFrom && logicalR === lastMoveFrom[0] && logicalC === lastMoveFrom[1]) {
              ctx.fillStyle = LAST_MOVE_FROM_HIGHLIGHT;
              ctx.fillRect(x, y, cellSize, cellSize);
              ctx.strokeStyle = LAST_MOVE_BORDER;
              ctx.lineWidth = 2;
              ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
            }
            if (lastMoveTo && logicalR === lastMoveTo[0] && logicalC === lastMoveTo[1]) {
              ctx.fillStyle = LAST_MOVE_TO_HIGHLIGHT;
              ctx.fillRect(x, y, cellSize, cellSize);
              ctx.strokeStyle = LAST_MOVE_BORDER;
              ctx.lineWidth = 2;
              ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
            }

            // Selected cell
            if (selectedCell && selectedCell[0] === logicalR && selectedCell[1] === logicalC) {
              ctx.fillStyle = SELECT_HIGHLIGHT;
              ctx.fillRect(x, y, cellSize, cellSize);
              ctx.strokeStyle = '#fff';
              ctx.lineWidth = 3;
              ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
            }

            // Legal move highlight
            if (legalMoves.some(([mr, mc]) => mr === logicalR && mc === logicalC)) {
              ctx.fillStyle = MOVE_HIGHLIGHT;
              ctx.fillRect(x, y, cellSize, cellSize);
              ctx.beginPath();
              ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize * 0.15, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(100, 255, 100, 0.7)';
              ctx.fill();
            }

            drawSquareNumber(logicalR, logicalC, x, y);

            // Skip the piece on the animating source square (it's being drawn separately)
            if (animHideLogical && animHideLogical[0] === logicalR && animHideLogical[1] === logicalC) {
              continue;
            }

            if (board[logicalR][logicalC]) {
              const piece = board[logicalR][logicalC];
              const cx = x + cellSize / 2;
              const cy = y + cellSize / 2;
              const fading = fadingPieces.find(f => f.logR === logicalR && f.logC === logicalC);
              drawPieceAt(piece, cx, cy, fading ? fading.opacity : 1);
            }
          }
        }

        // Draw fading-out pieces that are no longer on the board
        for (const fp of fadingPieces) {
          if (board[fp.logR] && board[fp.logR][fp.logC]) continue;
          const [dR, dC] = transformCoords(fp.logR, fp.logC);
          const cx = dC * cellSize + cellSize / 2;
          const cy = dR * cellSize + cellSize / 2;
          drawPieceAt(fp.piece, cx, cy, fp.opacity);
        }

        // Draw sliding piece on top
        if (animating && animPiece) {
          let t = animProgress;
          t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

          const fromX = animFromDisplay[1] * cellSize + cellSize / 2;
          const fromY = animFromDisplay[0] * cellSize + cellSize / 2;
          const toX   = animToDisplay[1] * cellSize + cellSize / 2;
          const toY   = animToDisplay[0] * cellSize + cellSize / 2;

          const cx = fromX + (toX - fromX) * t;
          const cy = fromY + (toY - fromY) * t;
          drawPieceAt(animPiece, cx, cy, 1);
        }
      });

      if (diamond45) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(size / 2, size * 0.03);
        ctx.lineTo(size * 0.97, size / 2);
        ctx.lineTo(size / 2, size * 0.97);
        ctx.lineTo(size * 0.03, size / 2);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    }

    canvas.addEventListener('pointerup', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cell = pointToDisplayCell(x, y);
      if (!cell || !onCellClick) return;

      const [displayR, displayC] = cell;
      const [logicalR, logicalC] = inverseTransformCoords(displayR, displayC);
      showClickIndicator(logicalR, logicalC);
      onCellClick(logicalR, logicalC, {
        shiftKey: !!e.shiftKey,
        clickCount: Number(e.detail) || 1,
        timeStamp: e.timeStamp,
        pointerType: e.pointerType || 'mouse',
      });
    });

    return {
      canvas,
      setBoard(b) { board = b; if (!animating) draw(); },
      getBoard() { return board; },
      setDiamond45(enabled) {
        diamond45 = !!enabled;
        draw();
      },
      toggleDiamond45() {
        diamond45 = !diamond45;
        draw();
        return diamond45;
      },
      isDiamond45() { return diamond45; },
      setLastMove(from, to) {
        lastMoveFrom = from ? [from[0], from[1]] : null;
        lastMoveTo = to ? [to[0], to[1]] : null;
        draw();
      },
      clearLastMove() {
        lastMoveFrom = null;
        lastMoveTo = null;
        draw();
      },
      setSelected(cell) { selectedCell = cell; draw(); },
      setLegalMoves(moves) { legalMoves = moves; draw(); },
      clearHighlights() { selectedCell = null; legalMoves = []; draw(); },
      onClick(fn) { onCellClick = fn; },
      isAnimating() { return animating; },

      /**
       * Animate a move:
       *  - oldBoard: board BEFORE the move
       *  - newBoard: board AFTER the move (final state)
       *  - from/to : [logicalR, logicalC]
       *
       * Phase 1 (0→500 ms): slide piece from → to (using oldBoard visuals)
       * Phase 2 (500→1500 ms): show final board; fade out any pieces that
       *         were on oldBoard but NOT on newBoard (captures / unlinks)
       */
      animateMove(oldBoard, newBoard, from, to) {
        // Cancel any running animation
        if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
        fadingPieces = [];
        animating = true;

        const piece = oldBoard[from[0]][from[1]];
        if (!piece) { board = newBoard; animating = false; draw(); return; }

        // Derive display coords (respecting rotation)
        animFromDisplay = transformCoords(from[0], from[1]);
        animToDisplay   = transformCoords(to[0], to[1]);
        animPiece       = { ...piece };
        animHideLogical = [from[0], from[1]];
        animProgress    = 0;
        animStartTime   = performance.now();

        // During slide, show oldBoard except the piece being moved
        board = oldBoard.map(row => row.map(c => c ? { ...c } : null));

        function slideLoop(now) {
          animProgress = Math.min(1, (now - animStartTime) / animDuration);
          draw();
          if (animProgress < 1) {
            animFrameId = requestAnimationFrame(slideLoop);
          } else {
            // Slide done → switch to final board and start fade phase
            animPiece = null;
            animHideLogical = null;
            board = newBoard;

            // Find pieces that disappeared (captured / unlinked)
            const disappeared = [];
            for (let r = 0; r < 8; r++) {
              for (let c = 0; c < 8; c++) {
                const oldP = oldBoard[r][c];
                const newP = newBoard[r][c];
                if (oldP && !newP) {
                  // skip the source square of the move (piece moved, not removed)
                  if (r === from[0] && c === from[1]) continue;
                  disappeared.push({ logR: r, logC: c, piece: { ...oldP }, opacity: 1 });
                }
              }
            }

            if (disappeared.length === 0) {
              // No removals → done
              lastMoveFrom = [from[0], from[1]];
              lastMoveTo = [to[0], to[1]];
              animating = false;
              draw();
              return;
            }

            // Fade phase: 1 second delay then 400 ms fade-out
            fadingPieces = disappeared;
            draw(); // show final board + full-opacity ghost pieces

            setTimeout(() => {
              fadeStartTime = performance.now();
              function fadeLoop(now) {
                const t = Math.min(1, (now - fadeStartTime) / fadeDuration);
                for (const fp of fadingPieces) fp.opacity = 1 - t;
                draw();
                if (t < 1) {
                  animFrameId = requestAnimationFrame(fadeLoop);
                } else {
                  fadingPieces = [];
                  lastMoveFrom = [from[0], from[1]];
                  lastMoveTo = [to[0], to[1]];
                  animating = false;
                  draw();
                }
              }
              animFrameId = requestAnimationFrame(fadeLoop);
            }, 1000); // 1-second delay before fade begins
          }
        }
        animFrameId = requestAnimationFrame(slideLoop);
      },

      setRotation(degrees) { rotation = degrees; draw(); },
      getRotation() { return rotation; },
      rotateToPlayer(color) {
        switch (color) {
          case 'black':
            rotation = 180;
            break;
          case 'white':
          default:
            rotation = 0;
            break;
        }
        draw();
        return rotation;
      },
      draw,
    };
  }

  return { create };
})();
