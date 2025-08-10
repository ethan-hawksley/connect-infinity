class ConnectFourGame {
    constructor() {
        this.peer = null;
        this.connections = [];
        this.isHost = false;
        this.gameState = {
            board: Array(6).fill().map(() => Array(6).fill(null)),
            currentPlayer: 0,
            players: [],
            gameStarted: false,
            winner: null,
            isDraw: false,
            scores: [] // Track 4-in-a-row counts for each player
        };
        this.playerName = '';
        this.myPlayerId = null;
        this.lastMoveTime = 0;
        this.COOLDOWN_TIME = 1000; // 1 second cooldown
        this.cooldownInterval = null;

        this.initializeEventListeners();
        this.showScreen('lobby-screen');
    }

    initializeEventListeners() {
        // Lobby controls
        document.getElementById('host-game-btn').addEventListener('click', () => this.hostGame());
        document.getElementById('join-game-btn').addEventListener('click', () => this.showJoinControls());
        document.getElementById('connect-btn').addEventListener('click', () => this.joinGame());
        document.getElementById('start-game-btn').addEventListener('click', () => this.startGame());
        document.getElementById('replay-btn').addEventListener('click', () => this.replayGame());
        document.getElementById('leave-game-btn').addEventListener('click', () => this.leaveGame());

        // Game board clicks
        document.getElementById('game-board').addEventListener('click', (e) => {
            if (e.target.classList.contains('cell')) {
                const col = parseInt(e.target.dataset.col);
                this.makeMove(col);
            }
        });

        // Enter key support
        document.getElementById('player-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') document.getElementById('host-game-btn').click();
        });

        document.getElementById('host-id').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') document.getElementById('connect-btn').click();
        });
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    updateConnectionStatus(status, message) {
        const statusElement = document.getElementById('connection-status');
        statusElement.className = status;
        statusElement.textContent = message;
    }

    async hostGame() {
        const nameInput = document.getElementById('player-name');
        if (!nameInput.value.trim()) {
            alert('Please enter your name first');
            return;
        }

        this.playerName = nameInput.value.trim();
        this.isHost = true;

        try {
            this.updateConnectionStatus('connecting', 'Starting game...');

            // Generate a random peer ID
            const peerId = 'connect4-' + Math.random().toString(36).substr(2, 9);
            this.peer = new Peer(peerId);

            this.peer.on('open', (id) => {
                this.myPlayerId = 0; // Host is always player 0
                this.gameState.players = [{ name: this.playerName, id: id, connected: true }];

                document.getElementById('my-peer-id').textContent = id;
                document.getElementById('host-info').style.display = 'block';
                this.updatePlayerList();
                this.updateConnectionStatus('connected', 'Hosting game');
            });

            this.peer.on('connection', (conn) => {
                this.handleNewConnection(conn);
            });

            this.peer.on('error', (err) => {
                console.error('Peer error:', err);
                this.updateConnectionStatus('disconnected', 'Connection error');
                alert('Failed to start game: ' + err.message);
            });

        } catch (error) {
            console.error('Error hosting game:', error);
            alert('Failed to host game');
        }
    }

    showJoinControls() {
        const nameInput = document.getElementById('player-name');
        if (!nameInput.value.trim()) {
            alert('Please enter your name first');
            return;
        }
        document.getElementById('join-controls').style.display = 'block';
    }

    async joinGame() {
        const hostId = document.getElementById('host-id').value.trim();
        const nameInput = document.getElementById('player-name');

        if (!hostId) {
            alert('Please enter the host ID');
            return;
        }

        this.playerName = nameInput.value.trim();
        this.isHost = false;

        try {
            this.updateConnectionStatus('connecting', 'Connecting...');

            const peerId = 'connect4-' + Math.random().toString(36).substr(2, 9);
            this.peer = new Peer(peerId);

            this.peer.on('open', () => {
                const conn = this.peer.connect(hostId);
                this.handleConnection(conn);
            });

            this.peer.on('error', (err) => {
                console.error('Peer error:', err);
                this.updateConnectionStatus('disconnected', 'Connection failed');
                alert('Failed to connect: ' + err.message);
            });

        } catch (error) {
            console.error('Error joining game:', error);
            alert('Failed to join game');
        }
    }

    handleNewConnection(conn) {
        this.connections.push(conn);
        this.handleConnection(conn);
    }

    handleConnection(conn) {
        conn.on('open', () => {
            if (this.isHost) {
                // Add new player
                const playerId = this.gameState.players.length;
                conn.send({
                    type: 'player-assigned',
                    playerId: playerId,
                    gameState: this.gameState
                });
            } else {
                // Send join request
                conn.send({
                    type: 'join-request',
                    playerName: this.playerName
                });
                // Store the connection for non-host players
                this.connections = [conn];
            }
        });

        conn.on('data', (data) => {
            this.handleMessage(data, conn);
        });

        conn.on('close', () => {
            if (this.isHost) {
                this.handlePlayerDisconnect(conn);
            } else {
                this.updateConnectionStatus('disconnected', 'Host disconnected');
                alert('Host disconnected');
                this.leaveGame();
            }
        });

        conn.on('error', (err) => {
            console.error('Connection error:', err);
        });
    }

    handleMessage(data, conn) {
        switch (data.type) {
            case 'join-request':
                if (this.isHost && this.gameState.players.length < 4) {
                    const playerId = this.gameState.players.length;
                    this.gameState.players.push({
                        name: data.playerName,
                        id: conn.peer,
                        connected: true
                    });

                    conn.send({
                        type: 'player-assigned',
                        playerId: playerId,
                        gameState: this.gameState
                    });

                    this.broadcastGameState();
                    this.updatePlayerList();
                }
                break;

            case 'player-assigned':
                this.myPlayerId = data.playerId;
                this.gameState = data.gameState;
                this.updatePlayerList();
                this.updateConnectionStatus('connected', 'Connected to game');

                if (this.gameState.gameStarted) {
                    this.showScreen('game-screen');
                    this.renderBoard();
                    this.updateGameInfo();
                }
                break;

            case 'game-state':
                this.gameState = data.gameState;
                this.updatePlayerList();
                if (this.gameState.gameStarted) {
                    this.showScreen('game-screen');
                    this.renderBoard();
                    this.updateGameInfo();
                }
                break;

            case 'move':
                if (this.isHost) {
                    this.processMove(data.col, data.playerId);
                }
                break;

            case 'start-game':
                this.gameState = data.gameState;
                this.showScreen('game-screen');
                this.renderBoard();
                this.updateGameInfo();
                break;

            case 'replay-game':
                this.gameState = data.gameState;
                this.renderBoard();
                this.updateGameInfo();
                break;
        }
    }

    handlePlayerDisconnect(conn) {
        const playerIndex = this.gameState.players.findIndex(p => p.id === conn.peer);
        if (playerIndex !== -1) {
            this.gameState.players[playerIndex].connected = false;
            this.broadcastGameState();
            this.updatePlayerList();
        }

        this.connections = this.connections.filter(c => c !== conn);
    }

    startGame() {
        if (!this.isHost) return;

        this.gameState.gameStarted = true;
        this.gameState.currentPlayer = 0;
        this.gameState.board = Array(6).fill().map(() => Array(6).fill(null));
        this.gameState.winner = null;
        this.gameState.isDraw = false;
        // Initialize scores for all players
        this.gameState.scores = Array(this.gameState.players.length).fill(0);

        this.broadcastMessage({ type: 'start-game', gameState: this.gameState });
        this.showScreen('game-screen');
        this.renderBoard();
        this.updateGameInfo();
        this.updatePlayerList();
    }

    makeMove(col) {
        if (!this.gameState.gameStarted || this.gameState.winner || this.gameState.isDraw) {
            return;
        }

        // Check cooldown
        const now = Date.now();
        if (now - this.lastMoveTime < this.COOLDOWN_TIME) {
            return;
        }

        if (this.isHost) {
            this.processMove(col, this.myPlayerId);
        } else {
            this.connections[0].send({
                type: 'move',
                col: col,
                playerId: this.myPlayerId
            });
        }

        this.lastMoveTime = now;
        this.startCooldown();
    }

    processMove(col, playerId) {
        if (!this.isHost) {
            return;
        }

        const row = Math.floor(col / 6);
        const actualCol = col % 6;

        // Check if cell is already occupied
        if (this.gameState.board[row][actualCol] !== null) {
            return; // Cell is already taken
        }

        // Place the piece
        this.gameState.board[row][actualCol] = playerId;

        // Check for 4-in-a-row and increment score
        if (this.checkWin(row, actualCol, playerId)) {
            this.gameState.scores[playerId]++;
            // Mark winning cells for visual effect
            this.markWinningCells(row, actualCol, playerId);
        }

        // Check if board is full (draw condition)
        if (this.checkDraw()) {
            this.gameState.isDraw = true;
            // Determine overall winner based on scores
            this.determineOverallWinner();
        }

        this.broadcastGameState();
        this.renderBoard();
        this.updateGameInfo();
        this.updatePlayerList();
    }

    checkWin(row, col, playerId) {
        const directions = [
            [0, 1],   // horizontal
            [1, 0],   // vertical
            [1, 1],   // diagonal \
            [1, -1]   // diagonal /
        ];

        for (let [dr, dc] of directions) {
            let count = 1;

            // Check positive direction
            for (let i = 1; i < 4; i++) {
                const r = row + dr * i;
                const c = col + dc * i;
                if (r >= 0 && r < 6 && c >= 0 && c < 6 && this.gameState.board[r][c] === playerId) {
                    count++;
                } else {
                    break;
                }
            }

            // Check negative direction
            for (let i = 1; i < 4; i++) {
                const r = row - dr * i;
                const c = col - dc * i;
                if (r >= 0 && r < 6 && c >= 0 && c < 6 && this.gameState.board[r][c] === playerId) {
                    count++;
                } else {
                    break;
                }
            }

            if (count >= 4) return true;
        }

        return false;
    }

    markWinningCells(row, col, playerId) {
        // This method would mark winning cells for visual effect
        // For now, we'll just note the achievement in console
        console.log(`Player ${playerId} scored a 4-in-a-row!`);
    }

    determineOverallWinner() {
        // Find the player with the most 4-in-a-rows
        let maxScore = Math.max(...this.gameState.scores);
        let winners = [];

        this.gameState.scores.forEach((score, index) => {
            if (score === maxScore) {
                winners.push(index);
            }
        });

        if (winners.length === 1) {
            this.gameState.winner = winners[0];
        } else {
            // Multiple players tied - it's a draw
            this.gameState.winner = null;
        }
    }

    checkDraw() {
        // Check if all cells are filled
        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < 6; col++) {
                if (this.gameState.board[row][col] === null) {
                    return false;
                }
            }
        }
        return true;
    }

    startCooldown() {
        let timeLeft = this.COOLDOWN_TIME / 1000;
        const cooldownElement = document.getElementById('cooldown-timer');
        const secondsElement = document.getElementById('cooldown-seconds');

        cooldownElement.style.display = 'block';
        secondsElement.textContent = timeLeft.toFixed(1);

        this.cooldownInterval = setInterval(() => {
            timeLeft -= 0.1;
            if (timeLeft <= 0) {
                cooldownElement.style.display = 'none';
                clearInterval(this.cooldownInterval);
            } else {
                secondsElement.textContent = timeLeft.toFixed(1);
            }
        }, 100);
    }

    renderBoard() {
        const boardElement = document.getElementById('game-board');
        boardElement.innerHTML = '';

        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < 6; col++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = row;
                cell.dataset.col = row * 6 + col; // Use linear index for free placement

                const player = this.gameState.board[row][col];
                if (player !== null) {
                    // Use different colors for different players
                    const colors = ['red', 'yellow', 'blue', 'green'];
                    cell.classList.add(colors[player % colors.length]);
                }

                // Only disable if game is over or cell is occupied
                if (this.gameState.winner !== null ||
                    this.gameState.isDraw ||
                    player !== null) {
                    cell.classList.add('disabled');
                }

                boardElement.appendChild(cell);
            }
        }
    }

    updateGameInfo() {
        const gameStatus = document.getElementById('game-status');
        const replayBtn = document.getElementById('replay-btn');

        if (this.gameState.winner !== null) {
            const winnerName = this.gameState.players[this.gameState.winner].name;
            const winnerScore = this.gameState.scores[this.gameState.winner];
            gameStatus.textContent = `🎉 ${winnerName} wins with ${winnerScore} four-in-a-rows!`;
            gameStatus.className = 'winner';

            // Show replay button only for host
            if (this.isHost) {
                replayBtn.style.display = 'inline-block';
            }
        } else if (this.gameState.isDraw) {
            // Show final scores in case of draw
            const maxScore = Math.max(...this.gameState.scores);
            const winners = this.gameState.players.filter((_, index) => this.gameState.scores[index] === maxScore);

            if (winners.length === 1) {
                gameStatus.textContent = `🎉 ${winners[0].name} wins with ${maxScore} four-in-a-rows!`;
                gameStatus.className = 'winner';
            } else {
                gameStatus.textContent = `It's a tie! Multiple players scored ${maxScore} four-in-a-rows!`;
                gameStatus.className = 'draw';
            }

            // Show replay button only for host
            if (this.isHost) {
                replayBtn.style.display = 'inline-block';
            }
        } else {
            gameStatus.textContent = 'Get 4 in a row to score! Game ends when board is full.';
            gameStatus.className = '';
            replayBtn.style.display = 'none';
        }

        // Update scores display
        this.updateScoresDisplay();
    }

    updatePlayerList() {
        const playersList = document.getElementById('players');
        const startGameBtn = document.getElementById('start-game-btn');
        playersList.innerHTML = '';

        this.gameState.players.forEach((player, index) => {
            const li = document.createElement('li');
            li.textContent = `${player.name} ${player.connected ? '🟢' : '🔴'}`;

            if (index === 0) {
                li.classList.add('host');
                li.textContent += ' (Host)';
            }

            playersList.appendChild(li);
        });

        // Show start game button only for host when there are 2+ players and game hasn't started
        if (this.isHost && this.gameState.players.length >= 2 && !this.gameState.gameStarted) {
            startGameBtn.style.display = 'block';
        } else {
            startGameBtn.style.display = 'none';
        }
    }

    updateScoresDisplay() {
        const scoresList = document.getElementById('scores-list');
        scoresList.innerHTML = '';

        if (this.gameState.gameStarted && this.gameState.scores.length > 0) {
            this.gameState.players.forEach((player, index) => {
                const scoreItem = document.createElement('div');
                scoreItem.className = 'score-item';

                const colors = ['red', 'yellow', 'blue', 'green'];
                const colorClass = colors[index % colors.length];

                scoreItem.innerHTML = `
                    <span class="player-color ${colorClass}">●</span>
                    <span class="player-name">${player.name}</span>
                    <span class="player-score">${this.gameState.scores[index] || 0}</span>
                `;

                scoresList.appendChild(scoreItem);
            });
        }
    }

    broadcastGameState() {
        this.broadcastMessage({ type: 'game-state', gameState: this.gameState });
    }

    broadcastMessage(message) {
        this.connections.forEach(conn => {
            if (conn.open) {
                conn.send(message);
            }
        });
    }

    replayGame() {
        if (!this.isHost) return;

        this.gameState.board = Array(6).fill().map(() => Array(6).fill(null));
        this.gameState.currentPlayer = 0;
        this.gameState.winner = null;
        this.gameState.isDraw = false;

        this.broadcastMessage({ type: 'start-game', gameState: this.gameState });
        this.renderBoard();
        this.updateGameInfo();
        this.updatePlayerList();
    }

    leaveGame() {
        if (this.peer) {
            this.peer.destroy();
        }

        if (this.cooldownInterval) {
            clearInterval(this.cooldownInterval);
        }

        this.peer = null;
        this.connections = [];
        this.isHost = false;
        this.gameState = {
            board: Array(6).fill().map(() => Array(6).fill(null)),
            currentPlayer: 0,
            players: [],
            gameStarted: false,
            winner: null,
            isDraw: false,
            scores: [] // Track 4-in-a-row counts for each player
        };

        document.getElementById('host-info').style.display = 'none';
        document.getElementById('join-controls').style.display = 'none';
        document.getElementById('player-name').value = '';
        document.getElementById('host-id').value = '';

        this.showScreen('lobby-screen');
        this.updateConnectionStatus('', '');
        this.updatePlayerList();
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new ConnectFourGame();
});
