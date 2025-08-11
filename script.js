// UNO Game - JavaScript Implementation
// Author: UNO Game Developer
// Version: 1.0.0

// ===== نظام الصوت المتقدم =====
class AudioManager {
    constructor() {
        this.audioContext = null;
        this.sounds = {};
        this.musicVolume = 0.3;
        this.soundVolume = 0.7;
        this.musicEnabled = true;
        this.soundEnabled = true;
        this.backgroundMusic = null;
        this.loadSounds();
    }

    async initAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    async loadSounds() {
        const soundFiles = {
            cardPlay: 'sounds/card_play.wav',
            cardDraw: 'sounds/card_draw.wav',
            unoCall: 'sounds/uno_call.wav',
            win: 'sounds/win.wav',
            lose: 'sounds/lose.wav',
            shuffle: 'sounds/shuffle.wav'
        };

        for (const [name, path] of Object.entries(soundFiles)) {
            try {
                const audio = new Audio(path);
                audio.preload = 'auto';
                this.sounds[name] = audio;
            } catch (error) {
                console.warn(`Failed to load sound: ${path}`, error);
            }
        }
    }

    playSound(soundName, volume = null) {
        if (!this.soundEnabled) return;
        
        const sound = this.sounds[soundName];
        if (sound) {
            try {
                sound.currentTime = 0;
                sound.volume = (volume !== null ? volume : this.soundVolume) * 0.8;
                sound.play().catch(e => console.warn('Sound play failed:', e));
            } catch (error) {
                console.warn(`Failed to play sound: ${soundName}`, error);
            }
        }
    }

    playBackgroundMusic() {
        if (!this.musicEnabled || this.backgroundMusic) return;
        
        // إنشاء موسيقى خلفية بسيطة باستخدام Web Audio API
        this.createBackgroundMusic();
    }

    stopBackgroundMusic() {
        if (this.backgroundMusic) {
            this.backgroundMusic.stop();
            this.backgroundMusic = null;
        }
    }

    createBackgroundMusic() {
        if (!this.audioContext) return;
        
        try {
            // إنشاء موسيقى خلفية بسيطة ومهدئة
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(220, this.audioContext.currentTime);
            
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(this.musicVolume * 0.1, this.audioContext.currentTime + 2);
            
            oscillator.start();
            this.backgroundMusic = oscillator;
            
            // إيقاف الموسيقى بعد فترة وإعادة تشغيلها
            setTimeout(() => {
                if (this.backgroundMusic) {
                    this.stopBackgroundMusic();
                    if (this.musicEnabled) {
                        setTimeout(() => this.playBackgroundMusic(), 5000);
                    }
                }
            }, 30000);
        } catch (error) {
            console.warn('Failed to create background music:', error);
        }
    }

    setMusicVolume(volume) {
        this.musicVolume = Math.max(0, Math.min(1, volume));
        if (this.backgroundMusic && this.backgroundMusic.gainNode) {
            this.backgroundMusic.gainNode.gain.setValueAtTime(
                this.musicVolume * 0.1, 
                this.audioContext.currentTime
            );
        }
    }

    setSoundVolume(volume) {
        this.soundVolume = Math.max(0, Math.min(1, volume));
    }

    toggleMusic() {
        this.musicEnabled = !this.musicEnabled;
        if (this.musicEnabled) {
            this.playBackgroundMusic();
        } else {
            this.stopBackgroundMusic();
        }
        return this.musicEnabled;
    }

    toggleSound() {
        this.soundEnabled = !this.soundEnabled;
        return this.soundEnabled;
    }
}

// إنشاء مدير الصوت العام
const audioManager = new AudioManager();

// ===== متغيرات اللعبة الأساسية =====
let gameState = {
    currentPlayer: 0,
    direction: 1, // 1 للاتجاه العادي، -1 للعكس
    players: [],
    deck: [],
    discardPile: [],
    currentColor: null,
    gameStarted: false,
    gameSettings: {
        playerCount: 4,
        aiDifficulty: 'medium',
        scoreLimit: 500,
        rules: {
            stacking: false,
            sevenO: false,
            jumpIn: false
        }
    },
    scores: [],
    round: 1,
    isMultiplayer: false,
    socket: null
};

// ===== فئات البطاقات =====
const CARD_TYPES = {
    NUMBER: 'number',
    SKIP: 'skip',
    REVERSE: 'reverse',
    DRAW_TWO: 'draw_two',
    WILD: 'wild',
    WILD_DRAW_FOUR: 'wild_draw_four'
};

const COLORS = ['red', 'blue', 'yellow', 'green'];
const WILD_COLORS = ['wild'];

// ===== فئة البطاقة =====
class Card {
    constructor(color, type, value = null) {
        this.color = color;
        this.type = type;
        this.value = value;
        this.id = this.generateId();
    }

    generateId() {
        return `${this.color}_${this.type}_${this.value || 'none'}_${Math.random().toString(36).substr(2, 9)}`;
    }

    getDisplayText() {
        if (this.type === CARD_TYPES.NUMBER) {
            return this.value.toString();
        }
        
        const typeMap = {
            [CARD_TYPES.SKIP]: '⊘',
            [CARD_TYPES.REVERSE]: '⇄',
            [CARD_TYPES.DRAW_TWO]: '+2',
            [CARD_TYPES.WILD]: 'W',
            [CARD_TYPES.WILD_DRAW_FOUR]: '+4'
        };
        
        return typeMap[this.type] || '?';
    }

    getPoints() {
        if (this.type === CARD_TYPES.NUMBER) {
            return this.value;
        }
        
        const pointMap = {
            [CARD_TYPES.SKIP]: 20,
            [CARD_TYPES.REVERSE]: 20,
            [CARD_TYPES.DRAW_TWO]: 20,
            [CARD_TYPES.WILD]: 50,
            [CARD_TYPES.WILD_DRAW_FOUR]: 50
        };
        
        return pointMap[this.type] || 0;
    }

    canPlayOn(topCard, currentColor) {
        // البطاقات البرية (Wild) يمكن لعبها دائماً
        if (this.type === CARD_TYPES.WILD || this.type === CARD_TYPES.WILD_DRAW_FOUR) {
            return true;
        }
        
        // إذا كانت البطاقة الحالية هي بطاقة رقمية
        if (this.type === CARD_TYPES.NUMBER) {
            // يمكن لعبها إذا طابقت اللون الحالي أو قيمة البطاقة العلوية
            return this.color === currentColor || this.value === topCard.value;
        }
        
        // إذا كانت البطاقة الحالية هي بطاقة حركة (Skip, Reverse, Draw Two)
        if (this.type === CARD_TYPES.SKIP || this.type === CARD_TYPES.REVERSE || this.type === CARD_TYPES.DRAW_TWO) {
            // يمكن لعبها إذا طابقت اللون الحالي أو نوع البطاقة العلوية
            return this.color === currentColor || this.type === topCard.type;
        }
        
        return false;
    }
}

// ===== فئة اللاعب =====
class Player {
    constructor(name, isAI = false, difficulty = 'medium') {
        this.name = name;
        this.isAI = isAI;
        this.difficulty = difficulty;
        this.hand = [];
        this.hasCalledUno = false;
        this.score = 0;
    }

    addCard(card) {
        this.hand.push(card);
        this.hasCalledUno = false;
    }

    removeCard(cardId) {
        const index = this.hand.findIndex(card => card.id === cardId);
        if (index !== -1) {
            return this.hand.splice(index, 1)[0];
        }
        return null;
    }

    getPlayableCards(topCard, currentColor) {
        return this.hand.filter(card => card.canPlayOn(topCard, currentColor));
    }

    calculateHandScore() {
        return this.hand.reduce((total, card) => total + card.getPoints(), 0);
    }

    shouldCallUno() {
        return this.hand.length === 2;
    }

    // ذكاء اصطناعي بسيط
    makeAIMove(topCard, currentColor) {
        if (!this.isAI) return null;

        const playableCards = this.getPlayableCards(topCard, currentColor);
        
        if (playableCards.length === 0) {
            return { action: 'draw' };
        }

        let selectedCard;
        let newColor = null;

        switch (this.difficulty) {
            case 'easy':
                selectedCard = playableCards[0]; // أول بطاقة متاحة
                break;
                
            case 'medium':
                // تفضيل البطاقات الخاصة أو البطاقات التي تطابق اللون
                selectedCard = playableCards.find(card => 
                    card.type !== CARD_TYPES.NUMBER && card.color === currentColor) ||
                    playableCards.find(card => card.color === currentColor) ||
                    playableCards.find(card => card.type !== CARD_TYPES.NUMBER) ||
                    playableCards[0];
                break;
                
            case 'hard':
                selectedCard = this.selectBestCard(playableCards, topCard, currentColor);
                if (selectedCard && (selectedCard.type === CARD_TYPES.WILD || selectedCard.type === CARD_TYPES.WILD_DRAW_FOUR)) {
                    newColor = this.selectBestColor();
                }
                break;
                
            default:
                selectedCard = playableCards[0];
        }

        const result = { action: 'play', card: selectedCard };
        if (newColor) {
            result.newColor = newColor;
        } else if (selectedCard && (selectedCard.type === CARD_TYPES.WILD || selectedCard.type === CARD_TYPES.WILD_DRAW_FOUR)) {
            result.newColor = this.selectBestColor();
        }

        return result;
    }

    selectBestCard(playableCards, topCard, currentColor) {
        // استراتيجية متقدمة للذكاء الاصطناعي (صعوبة Hard)
        // الأهداف:
        // 1. التخلص من البطاقات بسرعة.
        // 2. استخدام البطاقات الخاصة بذكاء.
        // 3. منع اللاعبين الآخرين من الفوز.
        // 4. تغيير اللون إذا كان ذلك مفيدًا.

        const aiPlayer = this;
        const topCardValue = topCard.value;
        const topCardType = topCard.type;

        // 1. تفضيل بطاقات +4 و +2 إذا كان الخصم لديه عدد قليل من البطاقات
        // أو إذا كانت هناك حاجة لتغيير اللون بشكل استراتيجي.
        const wildDrawFour = playableCards.find(card => card.type === CARD_TYPES.WILD_DRAW_FOUR);
        if (wildDrawFour) {
            // إذا كان الخصم التالي لديه بطاقات قليلة، أو إذا لم يكن هناك خيار أفضل
            const nextPlayerIndex = GameManager.getNextPlayerIndex(gameState.currentPlayer);
            const nextPlayer = gameState.players[nextPlayerIndex];
            if (nextPlayer.hand.length <= 2 || playableCards.length === 1) {
                return wildDrawFour;
            }
        }

        // 2. تفضيل بطاقات +2 إذا كان الخصم التالي لديه عدد قليل من البطاقات
        const drawTwo = playableCards.find(card => card.type === CARD_TYPES.DRAW_TWO && card.color === currentColor);
        if (drawTwo) {
            const nextPlayerIndex = GameManager.getNextPlayerIndex(gameState.currentPlayer);
            const nextPlayer = gameState.players[nextPlayerIndex];
            if (nextPlayer.hand.length <= 2) {
                return drawTwo;
            }
        }

        // 3. تفضيل بطاقات Skip و Reverse لتعطيل الخصوم
        const skipCard = playableCards.find(card => card.type === CARD_TYPES.SKIP && (card.color === currentColor || card.type === topCardType));
        if (skipCard) return skipCard;

        const reverseCard = playableCards.find(card => card.type === CARD_TYPES.REVERSE && (card.color === currentColor || card.type === topCardType));
        if (reverseCard) return reverseCard;

        // 4. تفضيل البطاقات التي تطابق اللون الحالي للتخلص منها
        const matchingColorCards = playableCards.filter(card => card.color === currentColor && card.type === CARD_TYPES.NUMBER);
        if (matchingColorCards.length > 0) {
            // تفضيل البطاقات ذات القيمة الأعلى للتخلص منها بسرعة
            return matchingColorCards.sort((a, b) => b.value - a.value)[0];
        }

        // 5. تفضيل البطاقات التي تطابق الرقم/النوع للتخلص منها
        const matchingValueOrTypeCards = playableCards.filter(card => 
            (card.type === CARD_TYPES.NUMBER && card.value === topCardValue) ||
            (card.type !== CARD_TYPES.NUMBER && card.type === topCardType)
        );
        if (matchingValueOrTypeCards.length > 0) {
            // تفضيل البطاقات الخاصة أولاً، ثم الأرقام الأعلى
            return matchingValueOrTypeCards.sort((a, b) => {
                if (a.type !== CARD_TYPES.NUMBER && b.type === CARD_TYPES.NUMBER) return -1;
                if (a.type === CARD_TYPES.NUMBER && b.type !== CARD_TYPES.NUMBER) return 1;
                return b.value - a.value; // لبطاقات الأرقام
            })[0];
        }

        // 6. إذا لم يكن هناك خيار أفضل، استخدم بطاقة Wild لتغيير اللون إلى اللون الأكثر شيوعًا في اليد
        const wildCard = playableCards.find(card => card.type === CARD_TYPES.WILD);
        if (wildCard) return wildCard;

        // 7. إذا لم يكن هناك أي من الخيارات أعلاه، العب أي بطاقة متاحة (عادةً ما تكون بطاقة رقمية).
        return playableCards[0];
    }

    selectBestColor() {
        // اختيار اللون الأكثر شيوعاً في اليد
        const colorCounts = {};
        COLORS.forEach(color => colorCounts[color] = 0);
        
        this.hand.forEach(card => {
            if (COLORS.includes(card.color)) {
                colorCounts[card.color]++;
            }
        });
        
        return Object.keys(colorCounts).reduce((a, b) => 
            colorCounts[a] > colorCounts[b] ? a : b);
    }
}

// ===== إدارة مجموعة البطاقات =====
class DeckManager {
    static createDeck() {
        const deck = [];
        
        // بطاقات ملونة
        COLORS.forEach(color => {
            // بطاقة 0 واحدة لكل لون
            deck.push(new Card(color, CARD_TYPES.NUMBER, 0));
            
            // بطاقتان من 1-9 لكل لون
            for (let i = 1; i <= 9; i++) {
                deck.push(new Card(color, CARD_TYPES.NUMBER, i));
                deck.push(new Card(color, CARD_TYPES.NUMBER, i));
            }
            
            // بطاقتان من كل نوع خاص لكل لون
            deck.push(new Card(color, CARD_TYPES.SKIP));
            deck.push(new Card(color, CARD_TYPES.SKIP));
            deck.push(new Card(color, CARD_TYPES.REVERSE));
            deck.push(new Card(color, CARD_TYPES.REVERSE));
            deck.push(new Card(color, CARD_TYPES.DRAW_TWO));
            deck.push(new Card(color, CARD_TYPES.DRAW_TWO));
        });
        
        // البطاقات البرية
        for (let i = 0; i < 4; i++) {
            deck.push(new Card('wild', CARD_TYPES.WILD));
            deck.push(new Card('wild', CARD_TYPES.WILD_DRAW_FOUR));
        }
        
        return deck;
    }

    static shuffleDeck(deck) {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    static dealCards(deck, players, cardsPerPlayer = 7) {
        players.forEach(player => {
            player.hand = [];
            for (let i = 0; i < cardsPerPlayer; i++) {
                if (deck.length > 0) {
                    player.addCard(deck.pop());
                }
            }
        });
    }
}

// ===== إدارة واجهة المستخدم =====
class UIManager {
    static showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    static showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        const container = document.getElementById('notifications');
        container.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    static updateGameInfo() {
        const currentPlayerName = gameState.players[gameState.currentPlayer]?.name || 'غير محدد';
        document.getElementById('currentPlayerName').textContent = currentPlayerName;
        document.getElementById('deckCount').textContent = gameState.deck.length;
        
        // تحديث اتجاه اللعب
        const directionIcon = document.getElementById('directionIcon');
        directionIcon.className = gameState.direction === 1 ? 'fas fa-arrow-right' : 'fas fa-arrow-left';
    }

    static renderCard(card, container, clickHandler = null) {
        const cardElement = document.createElement('div');
        cardElement.className = `card ${card.color}`;
        cardElement.dataset.cardId = card.id;
        cardElement.dataset.type = card.type;
        cardElement.dataset.color = card.color;
        
        if (card.type === CARD_TYPES.NUMBER) {
            cardElement.dataset.value = card.value;
            cardElement.textContent = card.value;
        } else {
            cardElement.textContent = card.getDisplayText();
        }
        
        if (clickHandler) {
            cardElement.addEventListener('click', () => clickHandler(card));
        }
        
        container.appendChild(cardElement);
        return cardElement;
    }

    static renderPlayerHand() {
        const handContainer = document.getElementById('playerHand');
        if (!handContainer) return;
        
        const humanPlayer = gameState.players[0];
        if (!humanPlayer) return;
        
        // تجنب إعادة الرسم غير الضرورية
        const currentCards = Array.from(handContainer.children);
        const newCardIds = humanPlayer.hand.map(card => card.id);
        const currentCardIds = currentCards.map(el => el.dataset.cardId);
        
        // إذا كانت البطاقات نفسها، فقط حدث حالة القابلية للعب
        if (JSON.stringify(newCardIds) === JSON.stringify(currentCardIds)) {
            const topCard = gameState.discardPile[gameState.discardPile.length - 1];
            currentCards.forEach((cardElement, index) => {
                const card = humanPlayer.hand[index];
                if (topCard && card && card.canPlayOn(topCard, gameState.currentColor)) {
                    cardElement.classList.add('playable');
                } else {
                    cardElement.classList.remove('playable');
                }
            });
            return;
        }
        
        // إعادة رسم كاملة فقط عند الحاجة
        handContainer.innerHTML = '';
        
        humanPlayer.hand.forEach(card => {
            const cardElement = UIManager.renderCard(card, handContainer, (clickedCard) => {
                GameManager.attemptPlayCard(clickedCard);
            });
            
            // تمييز البطاقات القابلة للعب
            const topCard = gameState.discardPile[gameState.discardPile.length - 1];
            if (topCard && card.canPlayOn(topCard, gameState.currentColor)) {
                cardElement.classList.add('playable');
            }
        });
    }

    static renderOpponents() {
        const opponents = gameState.players.slice(1);
        
        opponents.forEach((player, index) => {
            const opponentElement = document.getElementById(`opponent${index + 1}`);
            if (!opponentElement) return;
            
            const nameElement = opponentElement.querySelector('.player-name');
            const countElement = opponentElement.querySelector('.card-count');
            const cardsContainer = opponentElement.querySelector('.opponent-cards');
            
            if (nameElement) nameElement.textContent = player.name;
            if (countElement) countElement.textContent = player.hand.length;
            
            if (cardsContainer) {
                cardsContainer.innerHTML = '';
                // عرض ظهر البطاقات للمنافسين
                for (let i = 0; i < Math.min(player.hand.length, 10); i++) {
                    const backCard = document.createElement('div');
                    backCard.className = 'card back';
                    cardsContainer.appendChild(backCard);
                }
            }
        });
    }

    static renderTopCard() {
        const topCard = gameState.discardPile[gameState.discardPile.length - 1];
        const topCardElement = document.getElementById('topCard');
        
        if (topCard && topCardElement) {
            topCardElement.className = `card ${gameState.currentColor || topCard.color}`;
            topCardElement.dataset.type = topCard.type;
            topCardElement.dataset.color = topCard.color;
            
            if (topCard.type === CARD_TYPES.NUMBER) {
                topCardElement.dataset.value = topCard.value;
                topCardElement.textContent = topCard.value;
            } else {
                topCardElement.textContent = topCard.getDisplayText();
            }
        }
    }

    static updateUnoButton() {
        const unoButton = document.getElementById('unoBtn');
        const humanPlayer = gameState.players[0];
        
        if (humanPlayer && humanPlayer.shouldCallUno() && gameState.currentPlayer === 0) {
            unoButton.disabled = false;
            unoButton.classList.add('playable');
        } else {
            unoButton.disabled = true;
            unoButton.classList.remove('playable');
        }
    }

    static showColorPicker(callback) {
        const colorPicker = document.getElementById('colorPicker');
        colorPicker.classList.remove('hidden');
        
        const colorButtons = colorPicker.querySelectorAll('.color-btn');
        colorButtons.forEach(button => {
            button.onclick = () => {
                const selectedColor = button.dataset.color;
                colorPicker.classList.add('hidden');
                callback(selectedColor);
            };
        });
    }

    static renderAll() {
        UIManager.updateGameInfo();
        UIManager.renderPlayerHand();
        UIManager.renderOpponents();
        UIManager.renderTopCard();
        UIManager.updateUnoButton();
        UIManager.updateActiveRulesDisplay();
    }

    static updateActiveRulesDisplay() {
        const rulesDisplay = document.getElementById('rulesDisplay');
        const rulesList = document.getElementById('activeRulesList');
        
        if (!rulesDisplay || !rulesList) return;
        
        const activeRules = [];
        
        if (gameState.gameSettings.rules.stacking) {
            activeRules.push('تكديس البطاقات (+2 و +4)');
        }
        
        if (gameState.gameSettings.rules.sevenO) {
            activeRules.push('قاعدة السبعة والصفر');
        }
        
        if (gameState.gameSettings.rules.jumpIn) {
            activeRules.push('القفز في الدور');
        }
        
        if (activeRules.length > 0) {
            rulesList.innerHTML = '';
            activeRules.forEach(rule => {
                const li = document.createElement('li');
                li.textContent = rule;
                rulesList.appendChild(li);
            });
            rulesDisplay.classList.remove('hidden');
        } else {
            rulesDisplay.classList.add('hidden');
        }
    }
}

// ==// ===== إدارة اللعبة =====
class GameManager {
    static attemptPlayCard(card) {
        if (!gameState.gameStarted || gameState.currentPlayer !== 0) {
            return false;
        }

        const humanPlayer = gameState.players[0];
        const topCard = gameState.discardPile[gameState.discardPile.length - 1];

        if (!card.canPlayOn(topCard, gameState.currentColor)) {
            UIManager.showNotification('لا يمكن لعب هذه البطاقة!', 'error');
            return false;
        }

        // العثور على عنصر البطاقة في DOM
        const cardElement = document.querySelector(`[data-card-id="${card.id}"]`);
        if (cardElement) {
            // إنشاء نسخة من البطاقة للرسوم المتحركة
            const animatedCard = cardElement.cloneNode(true);
            animatedCard.classList.add('playing-animation');
            
            // حساب المسار إلى كومة اللعب
            const cardRect = cardElement.getBoundingClientRect();
            const discardPile = document.getElementById('discardPile');
            const discardRect = discardPile.getBoundingClientRect();
            
            // تعيين الموضع الأولي للبطاقة المتحركة
            animatedCard.style.position = 'fixed';
            animatedCard.style.left = cardRect.left + 'px';
            animatedCard.style.top = cardRect.top + 'px';
            animatedCard.style.width = cardRect.width + 'px';
            animatedCard.style.height = cardRect.height + 'px';
            animatedCard.style.zIndex = '1000';
            
            // حساب المسافة للحركة
            const deltaX = discardRect.left + discardRect.width/2 - cardRect.left - cardRect.width/2;
            const deltaY = discardRect.top + discardRect.height/2 - cardRect.top - cardRect.height/2;
            
            // تعيين متغيرات CSS للحركة
            animatedCard.style.setProperty('--target-x', deltaX + 'px');
            animatedCard.style.setProperty('--target-y', deltaY + 'px');
            
            // إضافة البطاقة المتحركة للصفحة
            document.body.appendChild(animatedCard);
            
            // إخفاء البطاقة الأصلية فوراً
            cardElement.style.opacity = '0';
            
            // تنفيذ الحركة بعد إضافة تأثير التوهج لكومة اللعب
            discardPile.classList.add('discard-pile-highlight');
            
            // إزالة البطاقة المتحركة بعد انتهاء الرسوم المتحركة
            setTimeout(() => {
                animatedCard.remove();
                discardPile.classList.remove('discard-pile-highlight');
            }, 800);
        }

        // التحقق من البطاقات البرية
        if (card.type === CARD_TYPES.WILD || card.type === CARD_TYPES.WILD_DRAW_FOUR) {
            UIManager.showColorPicker((selectedColor) => {
                this.executeCardPlay(humanPlayer, card, selectedColor);
            });
        } else {
            this.executeCardPlay(humanPlayer, card);
        }

        return true;
    }

    static executeCardPlay(player, card, newColor = null) {
        // تشغيل صوت لعب البطاقة
        audioManager.playSound('cardPlay');
        
        // لعب البطاقة
        const success = this.playCard(player, card, newColor);
        
        if (success) {
            // تحديث الواجهة بعد تأخير قصير للرسوم المتحركة
            setTimeout(() => {
                UIManager.renderPlayerHand();
                UIManager.renderTopCard();
                UIManager.updateGameInfo();
                
                // التحقق من الفوز
                if (player.hand.length === 0) {
                    audioManager.playSound('win');
                    this.endRound(player);
                    return;
                }
                
                // الانتقال للاعب التالي
                this.advanceToNextPlayer();
                this.nextTurn();
            }, 400);
        }
    }

    static initializeGame() {
        // إنشاء اللاعبين
        gameState.players = [];
        gameState.players.push(new Player('أنت', false));
        
        for (let i = 1; i < gameState.gameSettings.playerCount; i++) {
            gameState.players.push(new Player(`اللاعب ${i + 1}`, true, gameState.gameSettings.aiDifficulty));
        }
        
        // إضافة خاصية data-players لمنطقة اللعب
        const gameArea = document.querySelector('.game-area');
        if (gameArea) {
            gameArea.setAttribute('data-players', gameState.gameSettings.playerCount);
        }
        
        // إنشاء وخلط مجموعة البطاقات
        gameState.deck = DeckManager.shuffleDeck(DeckManager.createDeck());
        gameState.discardPile = [];
        
        // توزيع البطاقات
        DeckManager.dealCards(gameState.deck, gameState.players);
        
        // وضع أول بطاقة في كومة الرمي
        let firstCard;
        do {
            firstCard = gameState.deck.pop();
        } while (firstCard.type === CARD_TYPES.WILD || firstCard.type === CARD_TYPES.WILD_DRAW_FOUR);
        
        gameState.discardPile.push(firstCard);
        gameState.currentColor = firstCard.color;
        
        // تطبيق تأثير البطاقة الأولى إذا كانت خاصة
        GameManager.applyCardEffect(firstCard, true);
        
        gameState.gameStarted = true;
        UIManager.showScreen('gameScreen');
        UIManager.renderAll();
        
        // بدء دور اللعب
        GameManager.nextTurn();
    }

    static nextTurn() {
        if (!gameState.gameStarted) return;
        
        // التحقق من انتهاء اللعبة
        const winner = gameState.players.find(player => player.hand.length === 0);
        if (winner) {
            GameManager.endRound(winner);
            return;
        }
        
        UIManager.renderAll();
        
        const currentPlayer = gameState.players[gameState.currentPlayer];
        
        // إذا كان اللاعب الحالي ذكي اصطناعي
        if (currentPlayer.isAI) {
            setTimeout(() => {
                GameManager.playAITurn(currentPlayer);
            }, 1000);
        }
    }

    static playAITurn(player) {
        const topCard = gameState.discardPile[gameState.discardPile.length - 1];
        const aiMove = player.makeAIMove(topCard, gameState.currentColor);
        
        if (aiMove.action === 'draw') {
            GameManager.drawCard(player);
            UIManager.showNotification(`${player.name} سحب بطاقة`);
        } else if (aiMove.action === 'play') {
            const success = GameManager.playCard(player, aiMove.card, aiMove.newColor);
            if (success) {
                UIManager.showNotification(`${player.name} لعب ${aiMove.card.getDisplayText()}`);
                
                // استدعاء UNO تلقائياً للذكاء الاصطناعي
                if (player.shouldCallUno()) {
                    player.hasCalledUno = true;
                    UIManager.showNotification(`${player.name} قال UNO!`);
                }
            }
        }
        
        GameManager.advanceToNextPlayer();
        GameManager.nextTurn();
    }

    static attemptPlayCard(card) {
        if (gameState.currentPlayer !== 0) return; // ليس دور اللاعب البشري
        
        const topCard = gameState.discardPile[gameState.discardPile.length - 1];
        
        if (!card.canPlayOn(topCard, gameState.currentColor)) {
            UIManager.showNotification('لا يمكن لعب هذه البطاقة!', 'error');
            return;
        }
        
        const humanPlayer = gameState.players[0];
        
        if (card.type === CARD_TYPES.WILD || card.type === CARD_TYPES.WILD_DRAW_FOUR) {
            UIManager.showColorPicker((selectedColor) => {
                const success = GameManager.playCard(humanPlayer, card, selectedColor);
                if (success) {
                    GameManager.advanceToNextPlayer();
                    GameManager.nextTurn();
                }
            });
        } else {
            const success = GameManager.playCard(humanPlayer, card);
            if (success) {
                GameManager.advanceToNextPlayer();
                GameManager.nextTurn();
            }
        }
    }

    static playCard(player, card, newColor = null) {
        // إزالة البطاقة من يد اللاعب
        const removedCard = player.removeCard(card.id);
        if (!removedCard) return false;
        
        // إضافة البطاقة إلى كومة الرمي
        gameState.discardPile.push(removedCard);
        
        // تحديث اللون الحالي
        if (newColor) {
            gameState.currentColor = newColor;
        } else {
            gameState.currentColor = removedCard.color;
        }
        
        // تطبيق تأثير البطاقة
        GameManager.applyCardEffect(removedCard);
        
        return true;
    }

    static applyCardEffect(card, isFirstCard = false) {
        switch (card.type) {
            case CARD_TYPES.SKIP:
                if (!isFirstCard) {
                    GameManager.advanceToNextPlayer(); // تخطي اللاعب التالي
                    UIManager.showNotification('تم تخطي اللاعب التالي!');
                }
                break;
                
            case CARD_TYPES.REVERSE:
                gameState.direction *= -1;
                UIManager.showNotification('تم عكس اتجاه اللعب!');
                if (gameState.players.length === 2 && !isFirstCard) {
                    GameManager.advanceToNextPlayer(); // في لعبة لاعبين، العكس = تخطي
                }
                break;
                
            case CARD_TYPES.DRAW_TWO:
                if (!isFirstCard) {
                    const nextPlayerIndex = GameManager.getNextPlayerIndex();
                    const nextPlayer = gameState.players[nextPlayerIndex];
                    GameManager.drawCards(nextPlayer, 2);
                    GameManager.advanceToNextPlayer(); // تخطي اللاعب الذي سحب
                    UIManager.showNotification(`${nextPlayer.name} سحب بطاقتين!`);
                }
                break;
                
            case CARD_TYPES.WILD_DRAW_FOUR:
                if (!isFirstCard) {
                    const nextPlayerIndex = GameManager.getNextPlayerIndex();
                    const nextPlayer = gameState.players[nextPlayerIndex];
                    GameManager.drawCards(nextPlayer, 4);
                    GameManager.advanceToNextPlayer(); // تخطي اللاعب الذي سحب
                    UIManager.showNotification(`${nextPlayer.name} سحب أربع بطاقات!`);
                }
                break;
        }
    }

    static drawCard(player) {
        if (gameState.deck.length === 0) {
            GameManager.reshuffleDeck();
        }
        
        if (gameState.deck.length > 0) {
            player.addCard(gameState.deck.pop());
            // تشغيل صوت سحب البطاقة
            audioManager.playSound('cardDraw');
        }
    }

    static drawCards(player, count) {
        for (let i = 0; i < count; i++) {
            GameManager.drawCard(player);
        }
    }

    static reshuffleDeck() {
        if (gameState.discardPile.length <= 1) return;
        
        // الاحتفاظ بالبطاقة العلوية
        const topCard = gameState.discardPile.pop();
        
        // خلط باقي البطاقات وإضافتها للمجموعة
        gameState.deck = DeckManager.shuffleDeck([...gameState.discardPile]);
        gameState.discardPile = [topCard];
        
        // تشغيل صوت الخلط
        audioManager.playSound('shuffle');
        UIManager.showNotification('تم خلط البطاقات مرة أخرى!');
    }

    static getNextPlayerIndex() {
        const nextIndex = gameState.currentPlayer + gameState.direction;
        if (nextIndex >= gameState.players.length) {
            return 0;
        } else if (nextIndex < 0) {
            return gameState.players.length - 1;
        }
        return nextIndex;
    }

    static advanceToNextPlayer() {
        gameState.currentPlayer = GameManager.getNextPlayerIndex();
    }

    static callUno() {
        const humanPlayer = gameState.players[0];
        if (humanPlayer && humanPlayer.shouldCallUno() && gameState.currentPlayer === 0) {
            humanPlayer.hasCalledUno = true;
            audioManager.playSound('unoCall');
            UIManager.showNotification('UNO!', 'success');
        }
    }

    static endRound(winner) {
        gameState.gameStarted = false;
        
        // حساب النقاط
        gameState.players.forEach(player => {
            if (player !== winner) {
                const handScore = player.calculateHandScore();
                winner.score += handScore;
            }
        });
        
        // التحقق من انتهاء اللعبة
        if (winner.score >= gameState.gameSettings.scoreLimit) {
            GameManager.endGame(winner);
        } else {
            GameManager.startNewRound();
        }
    }

    static startNewRound() {
        gameState.round++;
        UIManager.showNotification(`بداية الجولة ${gameState.round}`);
        
        // إعادة تعيين حالة اللاعبين
        gameState.players.forEach(player => {
            player.hand = [];
            player.hasCalledUno = false;
        });
        
        setTimeout(() => {
            GameManager.initializeGame();
        }, 2000);
    }

    static endGame(winner) {
        // عرض شاشة النتائج
        document.getElementById('gameResult').textContent = `${winner.name} فاز باللعبة!`;
        
        const scoresTable = document.getElementById('finalScores');
        scoresTable.innerHTML = '';
        
        // ترتيب اللاعبين حسب النقاط
        const sortedPlayers = [...gameState.players].sort((a, b) => b.score - a.score);
        
        sortedPlayers.forEach((player, index) => {
            const row = document.createElement('div');
            row.innerHTML = `
                <span>${index + 1}. ${player.name}</span>
                <span>${player.score} نقطة</span>
            `;
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.padding = '0.5rem';
            row.style.borderBottom = '1px solid #eee';
            scoresTable.appendChild(row);
        });
        
        UIManager.showScreen('resultsScreen');
    }
}

// ===== مستمعي الأحداث =====
document.addEventListener('DOMContentLoaded', function() {
    // أزرار الشاشة الرئيسية
    document.getElementById('singlePlayerBtn').addEventListener('click', () => {
        gameState.isMultiplayer = false;
        UIManager.showScreen('gameSetupScreen');
    });

    document.getElementById('multiPlayerBtn').addEventListener('click', () => {
        gameState.isMultiplayer = true;
        UIManager.showNotification('الوضع الجماعي قيد التطوير', 'warning');
    });

    document.getElementById('settingsBtn').addEventListener('click', () => {
        UIManager.showScreen('settingsScreen');
    });

    // أزرار إعداد اللعبة
    document.getElementById('startGameBtn').addEventListener('click', () => {
        // قراءة الإعدادات
        gameState.gameSettings.playerCount = parseInt(document.getElementById('playerCount').value);
        gameState.gameSettings.aiDifficulty = document.getElementById('aiDifficulty').value;
        gameState.gameSettings.scoreLimit = parseInt(document.getElementById('scoreLimit').value);
        gameState.gameSettings.rules.stacking = document.getElementById('stackingRule').checked;
        gameState.gameSettings.rules.sevenO = document.getElementById('sevenORule').checked;
        gameState.gameSettings.rules.jumpIn = document.getElementById('jumpInRule').checked;
        
        GameManager.initializeGame();
    });

    document.getElementById('backToMenuBtn').addEventListener('click', () => {
        UIManager.showScreen('startScreen');
    });

    // أزرار اللعبة
    document.getElementById('drawCardBtn').addEventListener('click', () => {
        if (gameState.currentPlayer === 0 && gameState.gameStarted) {
            const humanPlayer = gameState.players[0];
            GameManager.drawCard(humanPlayer);
            UIManager.showNotification('سحبت بطاقة');
            UIManager.renderPlayerHand();
            
            // تمرير الدور بعد السحب
            GameManager.advanceToNextPlayer();
            GameManager.nextTurn();
        }
    });

    document.getElementById('unoBtn').addEventListener('click', () => {
        GameManager.callUno();
    });

    // أزرار النتائج
    document.getElementById('playAgainBtn').addEventListener('click', () => {
        // إعادة تعيين النقاط
        gameState.players.forEach(player => player.score = 0);
        gameState.round = 1;
        GameManager.initializeGame();
    });

    document.getElementById('mainMenuBtn').addEventListener('click', () => {
        UIManager.showScreen('startScreen');
    });

    // أزرار الإعدادات
    document.getElementById('saveSettingsBtn').addEventListener('click', () => {
        UIManager.showNotification('تم حفظ الإعدادات', 'success');
        UIManager.showScreen('startScreen');
    });

    document.getElementById('cancelSettingsBtn').addEventListener('click', () => {
        UIManager.showScreen('startScreen');
    });

    // أزرار التحكم
    document.getElementById('themeToggle').addEventListener('click', () => {
        const body = document.body;
        const currentTheme = body.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        body.setAttribute('data-theme', newTheme);
        
        const icon = document.querySelector('#themeToggle i');
        icon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    });

    document.getElementById('soundToggle').addEventListener('click', () => {
        const isEnabled = audioManager.toggleSound();
        const icon = document.querySelector('#soundToggle i');
        icon.className = isEnabled ? 'fas fa-volume-up' : 'fas fa-volume-mute';
        UIManager.showNotification(isEnabled ? 'تم تشغيل الصوت' : 'تم كتم الصوت');
    });

    // إضافة مستمعي الأحداث للتحكم في الصوت
    const musicToggle = document.getElementById('musicToggle');
    if (musicToggle) {
        musicToggle.addEventListener('click', () => {
            const isEnabled = audioManager.toggleMusic();
            const icon = musicToggle.querySelector('i');
            icon.className = isEnabled ? 'fas fa-music' : 'fas fa-music-slash';
            UIManager.showNotification(isEnabled ? 'تم تشغيل الموسيقى' : 'تم إيقاف الموسيقى');
        });
    }

    // التحكم في مستوى الصوت
    const soundVolumeSlider = document.getElementById('soundVolume');
    if (soundVolumeSlider) {
        soundVolumeSlider.addEventListener('input', (e) => {
            audioManager.setSoundVolume(e.target.value / 100);
        });
    }

    const musicVolumeSlider = document.getElementById('musicVolume');
    if (musicVolumeSlider) {
        musicVolumeSlider.addEventListener('input', (e) => {
            audioManager.setMusicVolume(e.target.value / 100);
        });
    }

    // تهيئة الصوت عند أول تفاعل
    document.addEventListener('click', async () => {
        await audioManager.initAudioContext();
        audioManager.playBackgroundMusic();
    }, { once: true });
});

// ===== تصدير للاستخدام العام =====
window.UNOGame = {
    GameManager,
    UIManager,
    Card,
    Player,
    DeckManager,
    gameState
};

console.log('تم تحميل لعبة UNO بنجاح!');


// ===== إضافات للرسوم المتحركة والتفاعل =====

// إدارة الرسوم المتحركة
class AnimationManager {
    static animateCardDraw(cardElement) {
        cardElement.classList.add('card-draw-animation');
        setTimeout(() => {
            cardElement.classList.remove('card-draw-animation');
        }, 800);
    }

    static animateCardPlay(cardElement, callback) {
        cardElement.classList.add('card-play-animation');
        setTimeout(() => {
            cardElement.remove();
            if (callback) callback();
        }, 600);
    }

    static showWinnerEffect(element) {
        element.classList.add('winner-effect');
        setTimeout(() => {
            element.classList.remove('winner-effect');
        }, 3000);
    }

    static createConfetti() {
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dda0dd'];
        
        for (let i = 0; i < 50; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.animationDelay = Math.random() * 3 + 's';
            confetti.style.animationDuration = (Math.random() * 3 + 2) + 's';
            
            document.body.appendChild(confetti);
            
            setTimeout(() => {
                confetti.remove();
            }, 5000);
        }
    }

    static pulseElement(element) {
        element.style.animation = 'pulse 0.5s ease-in-out';
        setTimeout(() => {
            element.style.animation = '';
        }, 500);
    }
}

// إدارة الأصوات (محاكاة) - تم استبدالها بـ AudioManager
// class SoundManager تم حذفها لتجنب التضارب

// تحسينات UIManager
const OriginalUIManager = UIManager;

class EnhancedUIManager extends OriginalUIManager {
    static renderCard(card, container, clickHandler = null) {
        const cardElement = super.renderCard(card, container, clickHandler);
        
        // إضافة تأثيرات بصرية للبطاقات الخاصة
        if (card.type !== CARD_TYPES.NUMBER) {
            cardElement.classList.add('special-card');
        }
        
        // إضافة تأثير الرسوم المتحركة عند الإضافة
        AnimationManager.animateCardDraw(cardElement);
        
        return cardElement;
    }
    
    static showNotification(message, type = 'info', duration = 3000) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // إضافة أيقونة حسب النوع
        const icon = document.createElement('i');
        switch (type) {
            case 'success':
                icon.className = 'fas fa-check-circle';
                break;
            case 'warning':
                icon.className = 'fas fa-exclamation-triangle';
                break;
            case 'error':
                icon.className = 'fas fa-times-circle';
                break;
            default:
                icon.className = 'fas fa-info-circle';
        }
        
        notification.insertBefore(icon, notification.firstChild);
        notification.insertBefore(document.createTextNode(' '), notification.children[1]);
        
        const container = document.getElementById('notifications');
        container.appendChild(notification);
        
        // إضافة تأثير الاختفاء
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, duration);
    }
    
    static updateGameInfo() {
        super.updateGameInfo();
        
        // إضافة تأثير نبضة لاسم اللاعب الحالي
        const currentPlayerElement = document.getElementById('currentPlayerName');
        if (currentPlayerElement) {
            AnimationManager.pulseElement(currentPlayerElement);
        }
    }
    
    static showColorPicker(callback) {
        const colorPicker = document.getElementById('colorPicker');
        colorPicker.classList.remove('hidden');
        
        // إضافة تأثير ظهور
        colorPicker.style.animation = 'colorPickerAppear 0.4s ease-out';
        
        const colorButtons = colorPicker.querySelectorAll('.color-btn');
        colorButtons.forEach((button, index) => {
            button.style.animationDelay = (index * 0.1) + 's';
            button.onclick = () => {
                const selectedColor = button.dataset.color;
                
                // تأثير النقر
                AnimationManager.pulseElement(button);
                SoundManager.playButtonSound();
                
                setTimeout(() => {
                    colorPicker.classList.add('hidden');
                    callback(selectedColor);
                }, 200);
            };
        });
    }
}

// استبدال UIManager بالنسخة المحسنة
Object.setPrototypeOf(UIManager, EnhancedUIManager);
Object.assign(UIManager, EnhancedUIManager);

// تحسينات GameManager
const OriginalGameManager = GameManager;

class EnhancedGameManager extends OriginalGameManager {
    static playCard(player, card, newColor = null) {
        const success = super.playCard(player, card, newColor);
        
        if (success) {
            SoundManager.playCardSound();
            
            // تأثيرات بصرية خاصة للبطاقات الخاصة
            if (card.type !== CARD_TYPES.NUMBER) {
                this.showSpecialCardEffect(card.type);
            }
        }
        
        return success;
    }
    
    static drawCard(player) {
        super.drawCard(player);
        SoundManager.playDrawSound();
    }
    
    static callUno() {
        super.callUno();
        SoundManager.playUnoSound();
        
        // تأثير بصري لزر UNO
        const unoButton = document.getElementById('unoBtn');
        if (unoButton) {
            AnimationManager.showWinnerEffect(unoButton);
        }
    }
    
    static endGame(winner) {
        super.endGame(winner);
        SoundManager.playWinSound();
        AnimationManager.createConfetti();
        
        // تأثير الفوز على النتيجة
        setTimeout(() => {
            const resultElement = document.getElementById('gameResult');
            if (resultElement) {
                AnimationManager.showWinnerEffect(resultElement);
            }
        }, 500);
    }
    
    static showSpecialCardEffect(cardType) {
        const centerArea = document.querySelector('.center-area');
        if (!centerArea) return;
        
        const effect = document.createElement('div');
        effect.className = 'special-effect';
        effect.style.position = 'absolute';
        effect.style.top = '50%';
        effect.style.left = '50%';
        effect.style.transform = 'translate(-50%, -50%)';
        effect.style.fontSize = '3rem';
        effect.style.color = 'white';
        effect.style.textShadow = '0 0 20px rgba(255,255,255,0.8)';
        effect.style.animation = 'specialEffect 1.5s ease-out';
        effect.style.pointerEvents = 'none';
        effect.style.zIndex = '1000';
        
        switch (cardType) {
            case CARD_TYPES.SKIP:
                effect.textContent = '⊘ تخطي!';
                break;
            case CARD_TYPES.REVERSE:
                effect.textContent = '⇄ عكس!';
                break;
            case CARD_TYPES.DRAW_TWO:
                effect.textContent = '+2 سحب اثنين!';
                break;
            case CARD_TYPES.WILD_DRAW_FOUR:
                effect.textContent = '+4 سحب أربعة!';
                break;
            case CARD_TYPES.WILD:
                effect.textContent = 'W تغيير اللون!';
                break;
        }
        
        centerArea.appendChild(effect);
        
        setTimeout(() => {
            effect.remove();
        }, 1500);
    }
}

// استبدال GameManager بالنسخة المحسنة
Object.setPrototypeOf(GameManager, EnhancedGameManager);
Object.assign(GameManager, EnhancedGameManager);

// إضافة CSS للتأثيرات الخاصة
const specialEffectCSS = `
@keyframes specialEffect {
    0% {
        transform: translate(-50%, -50%) scale(0);
        opacity: 0;
    }
    50% {
        transform: translate(-50%, -50%) scale(1.2);
        opacity: 1;
    }
    100% {
        transform: translate(-50%, -50%) scale(1);
        opacity: 0;
    }
}

@keyframes slideOut {
    0% {
        transform: translateY(0);
        opacity: 1;
    }
    100% {
        transform: translateY(-100px);
        opacity: 0;
    }
}

.special-card {
    position: relative;
}

.special-card::after {
    content: '✨';
    position: absolute;
    top: -5px;
    right: -5px;
    font-size: 0.8rem;
    animation: sparkle 2s infinite;
}

@keyframes sparkle {
    0%, 100% { opacity: 0; transform: scale(0.8); }
    50% { opacity: 1; transform: scale(1.2); }
}
`;

// إضافة CSS للتأثيرات
const styleSheet = document.createElement('style');
styleSheet.textContent = specialEffectCSS;
document.head.appendChild(styleSheet);

// تحسين مستمعي الأحداث
document.addEventListener('DOMContentLoaded', function() {
    // إضافة أصوات للأزرار
    document.querySelectorAll('button').forEach(button => {
        button.addEventListener('click', () => {
            SoundManager.playButtonSound();
            AnimationManager.pulseElement(button);
        });
    });
    
    // تحسين زر الصوت
    const soundToggle = document.getElementById('soundToggle');
    if (soundToggle) {
        soundToggle.addEventListener('click', () => {
            const isEnabled = SoundManager.toggle();
            const icon = soundToggle.querySelector('i');
            icon.className = isEnabled ? 'fas fa-volume-up' : 'fas fa-volume-mute';
            
            // إضافة مؤشر بصري للحالة
            soundToggle.style.opacity = isEnabled ? '1' : '0.5';
        });
    }
    
    // إضافة تأثيرات الماوس للبطاقات
    document.addEventListener('mouseover', (e) => {
        if (e.target.classList.contains('card') && !e.target.classList.contains('back')) {
            e.target.style.transform = 'translateY(-10px) scale(1.05)';
        }
    });
    
    document.addEventListener('mouseout', (e) => {
        if (e.target.classList.contains('card') && !e.target.classList.contains('back')) {
            e.target.style.transform = '';
        }
    });
    
    // إضافة تأثيرات لوحة المفاتيح
    document.addEventListener('keydown', (e) => {
        switch (e.key) {
            case 'u':
            case 'U':
                // اختصار لزر UNO
                const unoBtn = document.getElementById('unoBtn');
                if (unoBtn && !unoBtn.disabled) {
                    unoBtn.click();
                }
                break;
            case 'd':
            case 'D':
                // اختصار لسحب بطاقة
                const drawBtn = document.getElementById('drawCardBtn');
                if (drawBtn && gameState.currentPlayer === 0) {
                    drawBtn.click();
                }
                break;
            case 'Escape':
                // إغلاق منتقي الألوان
                const colorPicker = document.getElementById('colorPicker');
                if (colorPicker && !colorPicker.classList.contains('hidden')) {
                    colorPicker.classList.add('hidden');
                }
                break;
        }
    });
});

// إضافة معلومات الاختصارات
const helpText = `
اختصارات لوحة المفاتيح:
U - زر UNO
D - سحب بطاقة
ESC - إغلاق منتقي الألوان
`;

console.log(helpText);

// تصدير الفئات الجديدة
window.UNOGame.AnimationManager = AnimationManager;
window.UNOGame.SoundManager = SoundManager;

console.log('تم تحميل التحسينات بنجاح! 🎮✨');


// ===== تحسينات الذكاء الاصطناعي وآليات اللعبة =====

// تحسين فئة الذكاء الاصطناعي
class EnhancedAIPlayer {
    constructor(difficulty = 'medium') {
        this.difficulty = difficulty;
        this.strategy = this.getStrategy(difficulty);
    }
    
    getStrategy(difficulty) {
        switch (difficulty) {
            case 'easy':
                return {
                    thinkTime: 500,
                    randomness: 0.7,
                    cardPriority: 'random',
                    unoCallChance: 0.3
                };
            case 'medium':
                return {
                    thinkTime: 1000,
                    randomness: 0.4,
                    cardPriority: 'smart',
                    unoCallChance: 0.7
                };
            case 'hard':
                return {
                    thinkTime: 1500,
                    randomness: 0.1,
                    cardPriority: 'strategic',
                    unoCallChance: 0.95
                };
            default:
                return this.getStrategy('medium');
        }
    }
    
    async makeMove(player, gameState) {
        // محاكاة وقت التفكير
        await this.delay(this.strategy.thinkTime);
        
        const playableCards = this.getPlayableCards(player, gameState);
        
        if (playableCards.length === 0) {
            // لا توجد بطاقات قابلة للعب - سحب بطاقة
            GameManager.drawCard(player);
            
            // التحقق من البطاقة المسحوبة
            const newCard = player.hand[player.hand.length - 1];
            const topCard = gameState.discardPile[gameState.discardPile.length - 1];
            
            if (newCard.canPlayOn(topCard, gameState.currentColor)) {
                // لعب البطاقة المسحوبة إذا كانت قابلة للعب
                await this.delay(500);
                const newColor = this.chooseColor(newCard, player);
                GameManager.playCard(player, newCard, newColor);
            }
            return;
        }
        
        // اختيار البطاقة للعب
        const selectedCard = this.selectCard(playableCards, player, gameState);
        const newColor = this.chooseColor(selectedCard, player);
        
        // التحقق من استدعاء UNO
        if (player.hand.length === 2 && Math.random() < this.strategy.unoCallChance) {
            GameManager.callUno();
        }
        
        GameManager.playCard(player, selectedCard, newColor);
    }
    
    getPlayableCards(player, gameState) {
        const topCard = gameState.discardPile[gameState.discardPile.length - 1];
        return player.hand.filter(card => card.canPlayOn(topCard, gameState.currentColor));
    }
    
    selectCard(playableCards, player, gameState) {
        switch (this.strategy.cardPriority) {
            case 'random':
                return this.selectRandomCard(playableCards);
            case 'smart':
                return this.selectSmartCard(playableCards, player, gameState);
            case 'strategic':
                return this.selectStrategicCard(playableCards, player, gameState);
            default:
                return playableCards[0];
        }
    }
    
    selectRandomCard(playableCards) {
        return playableCards[Math.floor(Math.random() * playableCards.length)];
    }
    
    selectSmartCard(playableCards, player, gameState) {
        // ترتيب الأولويات:
        // 1. البطاقات الرقمية أولاً
        // 2. بطاقات الإجراء
        // 3. البطاقات البرية أخيراً
        
        const numberCards = playableCards.filter(card => card.type === CARD_TYPES.NUMBER);
        const actionCards = playableCards.filter(card => 
            card.type === CARD_TYPES.SKIP || 
            card.type === CARD_TYPES.REVERSE || 
            card.type === CARD_TYPES.DRAW_TWO
        );
        const wildCards = playableCards.filter(card => 
            card.type === CARD_TYPES.WILD || 
            card.type === CARD_TYPES.WILD_DRAW_FOUR
        );
        
        if (numberCards.length > 0) {
            return this.selectHighestValueCard(numberCards);
        } else if (actionCards.length > 0) {
            return actionCards[0];
        } else {
            return wildCards[0];
        }
    }
    
    selectStrategicCard(playableCards, player, gameState) {
        // استراتيجية متقدمة تأخذ في الاعتبار:
        // 1. عدد البطاقات لدى اللاعبين الآخرين
        // 2. الألوان الأكثر شيوعاً في اليد
        // 3. البطاقات الخاصة للدفاع أو الهجوم
        
        const opponents = gameState.players.filter((p, index) => index !== gameState.currentPlayer);
        const minOpponentCards = Math.min(...opponents.map(p => p.hand.length));
        
        // إذا كان هناك لاعب قريب من الفوز، استخدم بطاقات الهجوم
        if (minOpponentCards <= 2) {
            const attackCards = playableCards.filter(card => 
                card.type === CARD_TYPES.DRAW_TWO || 
                card.type === CARD_TYPES.WILD_DRAW_FOUR ||
                card.type === CARD_TYPES.SKIP
            );
            if (attackCards.length > 0) {
                return attackCards[0];
            }
        }
        
        // اختيار اللون الأكثر شيوعاً في اليد
        const colorCounts = this.countColors(player.hand);
        const mostCommonColor = Object.keys(colorCounts).reduce((a, b) => 
            colorCounts[a] > colorCounts[b] ? a : b
        );
        
        const sameColorCards = playableCards.filter(card => card.color === mostCommonColor);
        if (sameColorCards.length > 0) {
            return this.selectHighestValueCard(sameColorCards);
        }
        
        return this.selectSmartCard(playableCards, player, gameState);
    }
    
    selectHighestValueCard(cards) {
        return cards.reduce((highest, card) => {
            const cardValue = this.getCardValue(card);
            const highestValue = this.getCardValue(highest);
            return cardValue > highestValue ? card : highest;
        });
    }
    
    getCardValue(card) {
        switch (card.type) {
            case CARD_TYPES.NUMBER:
                return card.value;
            case CARD_TYPES.SKIP:
            case CARD_TYPES.REVERSE:
            case CARD_TYPES.DRAW_TWO:
                return 20;
            case CARD_TYPES.WILD:
                return 50;
            case CARD_TYPES.WILD_DRAW_FOUR:
                return 50;
            default:
                return 0;
        }
    }
    
    chooseColor(card, player) {
        if (card.type !== CARD_TYPES.WILD && card.type !== CARD_TYPES.WILD_DRAW_FOUR) {
            return null;
        }
        
        // اختيار اللون الأكثر شيوعاً في اليد
        const colorCounts = this.countColors(player.hand);
        delete colorCounts['black']; // إزالة اللون الأسود (البطاقات البرية)
        
        if (Object.keys(colorCounts).length === 0) {
            return COLORS[Math.floor(Math.random() * 4)]; // اختيار عشوائي
        }
        
        return Object.keys(colorCounts).reduce((a, b) => 
            colorCounts[a] > colorCounts[b] ? a : b
        );
    }
    
    countColors(hand) {
        const counts = {};
        hand.forEach(card => {
            if (card.color && card.color !== 'black') {
                counts[card.color] = (counts[card.color] || 0) + 1;
            }
        });
        return counts;
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// تحسين إدارة الدور
class TurnManager {
    static async processTurn() {
        const currentPlayer = gameState.players[gameState.currentPlayer];
        
        if (currentPlayer.isHuman) {
            // دور اللاعب البشري - انتظار الإدخال
            UIManager.enablePlayerControls(true);
            UIManager.highlightPlayableCards();
        } else {
            // دور الذكاء الاصطناعي
            UIManager.enablePlayerControls(false);
            UIManager.showAIThinking(gameState.currentPlayer);
            
            const aiPlayer = new EnhancedAIPlayer(gameState.aiDifficulty);
            await aiPlayer.makeMove(currentPlayer, gameState);
            
            UIManager.hideAIThinking(gameState.currentPlayer);
            
            // التحقق من انتهاء اللعبة
            if (currentPlayer.hand.length === 0) {
                GameManager.endGame(currentPlayer);
                return;
            }
            
            // الانتقال للدور التالي
            setTimeout(() => {
                GameManager.nextTurn();
            }, 1000);
        }
    }
    
    static nextTurn() {
        // تحديث الدور
        if (gameState.direction === 1) {
            gameState.currentPlayer = (gameState.currentPlayer + 1) % gameState.players.length;
        } else {
            gameState.currentPlayer = (gameState.currentPlayer - 1 + gameState.players.length) % gameState.players.length;
        }
        
        UIManager.updateGameInfo();
        this.processTurn();
    }
}

// تحسين UIManager
Object.assign(UIManager, {
    enablePlayerControls(enabled) {
        const drawBtn = document.getElementById('drawCardBtn');
        const passBtn = document.getElementById('passBtn');
        const unoBtn = document.getElementById('unoBtn');
        
        if (drawBtn) drawBtn.disabled = !enabled;
        if (passBtn) passBtn.disabled = !enabled;
        if (unoBtn) unoBtn.disabled = !enabled;
        
        // تمكين/تعطيل النقر على البطاقات
        const playerCards = document.querySelectorAll('.player-hand .card');
        playerCards.forEach(card => {
            card.style.pointerEvents = enabled ? 'auto' : 'none';
            card.style.opacity = enabled ? '1' : '0.7';
        });
    },
    
    highlightPlayableCards() {
        const humanPlayer = gameState.players[0];
        const topCard = gameState.discardPile[gameState.discardPile.length - 1];
        
        const playerCards = document.querySelectorAll('.player-hand .card');
        playerCards.forEach((cardElement, index) => {
            const card = humanPlayer.hand[index];
            if (card && card.canPlayOn(topCard, gameState.currentColor)) {
                cardElement.classList.add('playable');
            } else {
                cardElement.classList.remove('playable');
            }
        });
    },
    
    showAIThinking(playerIndex) {
        const opponentElement = document.getElementById(`opponent${playerIndex}`);
        if (opponentElement) {
            const thinkingIndicator = document.createElement('div');
            thinkingIndicator.className = 'thinking-indicator';
            thinkingIndicator.innerHTML = '🤔 يفكر...';
            thinkingIndicator.style.position = 'absolute';
            thinkingIndicator.style.top = '10px';
            thinkingIndicator.style.right = '10px';
            thinkingIndicator.style.background = 'rgba(255,255,255,0.9)';
            thinkingIndicator.style.padding = '5px 10px';
            thinkingIndicator.style.borderRadius = '15px';
            thinkingIndicator.style.fontSize = '0.8rem';
            thinkingIndicator.style.animation = 'pulse 1s infinite';
            
            opponentElement.style.position = 'relative';
            opponentElement.appendChild(thinkingIndicator);
        }
    },
    
    hideAIThinking(playerIndex) {
        const opponentElement = document.getElementById(`opponent${playerIndex}`);
        if (opponentElement) {
            const thinkingIndicator = opponentElement.querySelector('.thinking-indicator');
            if (thinkingIndicator) {
                thinkingIndicator.remove();
            }
        }
    }
});

// تحسين GameManager
Object.assign(GameManager, {
    nextTurn() {
        TurnManager.nextTurn();
    },
    
    async startGame() {
        // الكود الأصلي لبدء اللعبة
        this.initializeGame();
        UIManager.renderGame();
        
        // بدء الدور الأول
        await TurnManager.processTurn();
    }
});

// إضافة مستمعي الأحداث المحسنين
document.addEventListener('DOMContentLoaded', function() {
    // تحسين زر سحب البطاقة
    const drawCardBtn = document.getElementById('drawCardBtn');
    if (drawCardBtn) {
        drawCardBtn.addEventListener('click', () => {
            if (gameState.currentPlayer === 0) { // اللاعب البشري
                const humanPlayer = gameState.players[0];
                GameManager.drawCard(humanPlayer);
                
                // التحقق من إمكانية لعب البطاقة المسحوبة
                const drawnCard = humanPlayer.hand[humanPlayer.hand.length - 1];
                const topCard = gameState.discardPile[gameState.discardPile.length - 1];
                
                if (drawnCard.canPlayOn(topCard, gameState.currentColor)) {
                    UIManager.showNotification('يمكنك لعب البطاقة المسحوبة!', 'info');
                } else {
                    // الانتقال للدور التالي
                    setTimeout(() => {
                        GameManager.nextTurn();
                    }, 1000);
                }
                
                UIManager.renderPlayerHand();
                UIManager.highlightPlayableCards();
            }
        });
    }
    
    // تحسين زر التمرير
    const passBtn = document.getElementById('passBtn');
    if (passBtn) {
        passBtn.addEventListener('click', () => {
            if (gameState.currentPlayer === 0) {
                // التحقق من وجود بطاقات قابلة للعب
                const humanPlayer = gameState.players[0];
                const topCard = gameState.discardPile[gameState.discardPile.length - 1];
                const playableCards = humanPlayer.hand.filter(card => 
                    card.canPlayOn(topCard, gameState.currentColor)
                );
                
                if (playableCards.length > 0) {
                    UIManager.showNotification('لا يمكنك التمرير عندما تملك بطاقات قابلة للعب!', 'warning');
                    return;
                }
                
                GameManager.nextTurn();
            }
        });
    }
});

// إضافة CSS للمؤشرات الجديدة
const additionalCSS = `
.thinking-indicator {
    animation: pulse 1s infinite;
}

@keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
}

.card.playable {
    box-shadow: 0 0 15px rgba(255, 255, 0, 0.8);
    transform: translateY(-5px);
}

.player-hand .card:hover {
    transform: translateY(-10px) scale(1.05);
    transition: all 0.3s ease;
}
`;

const additionalStyleSheet = document.createElement('style');
additionalStyleSheet.textContent = additionalCSS;
document.head.appendChild(additionalStyleSheet);

console.log('تم تحميل تحسينات آليات اللعبة بنجاح! 🎯🤖');


// ===== دعم اللعب الجماعي مع Socket.io =====

class MultiplayerManager {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.roomId = null;
        this.playerId = null;
        this.isHost = false;
        this.playerName = '';
    }

    connect() {
        if (this.socket) {
            this.socket.disconnect();
        }

        this.socket = io();
        this.setupEventListeners();
        
        this.socket.on('connect', () => {
            this.isConnected = true;
            this.playerId = this.socket.id;
            console.log('متصل بالخادم:', this.playerId);
        });

        this.socket.on('disconnect', () => {
            this.isConnected = false;
            console.log('انقطع الاتصال بالخادم');
        });
    }

    setupEventListeners() {
        // إنشاء غرفة جديدة
        this.socket.on('room_created', (data) => {
            this.roomId = data.roomId;
            this.isHost = data.isHost;
            this.showMultiplayerLobby();
            UIManager.showNotification(`تم إنشاء الغرفة: ${this.roomId}`, 'success');
        });

        // تحديث الغرفة
        this.socket.on('room_updated', (gameData) => {
            this.updateLobby(gameData);
        });

        // بدء اللعبة
        this.socket.on('game_started', (gameData) => {
            this.startMultiplayerGame(gameData);
        });

        // تحديث اللعبة
        this.socket.on('game_updated', (gameData) => {
            this.updateGame(gameData);
        });

        // انتهاء اللعبة
        this.socket.on('game_ended', (data) => {
            UIManager.showNotification(`انتهت اللعبة! الفائز: ${data.winner}`, 'success');
            AnimationManager.createConfetti();
        });

        // استدعاء UNO
        this.socket.on('uno_called', (data) => {
            UIManager.showNotification('تم استدعاء UNO!', 'info');
            SoundManager.playUnoSound();
        });

        // رسائل الدردشة
        this.socket.on('chat_message', (data) => {
            this.displayChatMessage(data);
        });

        // أخطاء
        this.socket.on('error', (data) => {
            UIManager.showNotification(data.message, 'error');
        });
    }

    createRoom(settings = {}) {
        if (!this.isConnected) {
            this.connect();
        }

        this.socket.emit('create_room', { settings });
    }

    joinRoom(roomId, playerName) {
        if (!this.isConnected) {
            this.connect();
        }

        this.playerName = playerName;
        this.socket.emit('join_room', { roomId, playerName });
    }

    toggleReady() {
        if (this.socket) {
            this.socket.emit('toggle_ready');
        }
    }

    startGame() {
        if (this.socket && this.isHost) {
            this.socket.emit('start_game');
        }
    }

    playCard(cardIndex, newColor = null) {
        if (this.socket) {
            this.socket.emit('play_card', { cardIndex, newColor });
        }
    }

    drawCard() {
        if (this.socket) {
            this.socket.emit('draw_card');
        }
    }

    callUno() {
        if (this.socket) {
            this.socket.emit('call_uno');
        }
    }

    sendChatMessage(message) {
        if (this.socket && message.trim()) {
            this.socket.emit('send_message', { message: message.trim() });
        }
    }

    showMultiplayerLobby() {
        // إخفاء القائمة الرئيسية
        document.getElementById('mainMenu').classList.add('hidden');
        
        // إظهار لوبي اللعب الجماعي
        let lobbyElement = document.getElementById('multiplayerLobby');
        if (!lobbyElement) {
            lobbyElement = this.createLobbyElement();
            document.body.appendChild(lobbyElement);
        }
        
        lobbyElement.classList.remove('hidden');
        
        // تحديث معلومات الغرفة
        document.getElementById('roomIdDisplay').textContent = this.roomId;
        document.getElementById('roomLink').textContent = `${window.location.origin}?room=${this.roomId}`;
    }

    createLobbyElement() {
        const lobby = document.createElement('div');
        lobby.id = 'multiplayerLobby';
        lobby.className = 'screen hidden';
        lobby.innerHTML = `
            <div class="lobby-container">
                <h2>لوبي اللعب الجماعي</h2>
                
                <div class="room-info">
                    <div class="room-code">
                        <label>رمز الغرفة:</label>
                        <span id="roomIdDisplay"></span>
                        <button onclick="navigator.clipboard.writeText(document.getElementById('roomIdDisplay').textContent)">نسخ</button>
                    </div>
                    <div class="room-link">
                        <label>رابط الغرفة:</label>
                        <span id="roomLink"></span>
                        <button onclick="navigator.clipboard.writeText(document.getElementById('roomLink').textContent)">نسخ الرابط</button>
                    </div>
                </div>

                <div class="players-list">
                    <h3>اللاعبون</h3>
                    <div id="playersList"></div>
                </div>

                <div class="lobby-controls">
                    <button id="readyBtn" onclick="multiplayerManager.toggleReady()">جاهز</button>
                    <button id="startGameBtn" onclick="multiplayerManager.startGame()" class="hidden">بدء اللعبة</button>
                    <button onclick="multiplayerManager.leaveLobby()">مغادرة</button>
                </div>

                <div class="chat-container">
                    <div id="chatMessages"></div>
                    <div class="chat-input">
                        <input type="text" id="chatInput" placeholder="اكتب رسالة..." maxlength="100">
                        <button onclick="multiplayerManager.sendChatFromInput()">إرسال</button>
                    </div>
                </div>
            </div>
        `;
        
        // إضافة مستمع لإرسال الرسائل بالضغط على Enter
        lobby.querySelector('#chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatFromInput();
            }
        });
        
        return lobby;
    }

    updateLobby(gameData) {
        const playersList = document.getElementById('playersList');
        const startGameBtn = document.getElementById('startGameBtn');
        const readyBtn = document.getElementById('readyBtn');
        
        if (!playersList) return;
        
        // تحديث قائمة اللاعبين
        playersList.innerHTML = '';
        gameData.players.forEach(player => {
            const playerElement = document.createElement('div');
            playerElement.className = 'player-item';
            playerElement.innerHTML = `
                <span class="player-name">${player.name}</span>
                <span class="player-status">
                    ${player.isHost ? '👑' : ''}
                    ${player.isReady ? '✅' : '⏳'}
                </span>
            `;
            playersList.appendChild(playerElement);
        });
        
        // تحديث أزرار التحكم
        if (this.isHost) {
            const allReady = gameData.players.length >= 2 && gameData.players.every(p => p.isReady);
            startGameBtn.classList.toggle('hidden', !allReady);
        }
        
        // تحديث حالة زر الاستعداد
        const currentPlayer = gameData.players.find(p => p.id === this.playerId);
        if (currentPlayer) {
            readyBtn.textContent = currentPlayer.isReady ? 'إلغاء الاستعداد' : 'جاهز';
            readyBtn.classList.toggle('ready', currentPlayer.isReady);
        }
    }

    startMultiplayerGame(gameData) {
        // إخفاء اللوبي
        document.getElementById('multiplayerLobby').classList.add('hidden');
        
        // إظهار شاشة اللعبة
        document.getElementById('gameScreen').classList.remove('hidden');
        
        // تحديث حالة اللعبة
        this.updateGame(gameData);
        
        UIManager.showNotification('بدأت اللعبة!', 'success');
    }

    updateGame(gameData) {
        // تحديث حالة اللعبة العامة
        gameState = gameData.gameState;
        gameState.players = gameData.players;
        
        // تحديث واجهة المستخدم
        UIManager.renderGame();
        UIManager.updateGameInfo();
        
        // تحديث يد اللاعب
        const currentPlayer = gameData.players.find(p => p.id === this.playerId);
        if (currentPlayer && currentPlayer.hand) {
            // تحديث يد اللاعب الحالي
            gameState.players[0] = currentPlayer;
            UIManager.renderPlayerHand();
        }
        
        // تحديث اللاعبين المنافسين
        UIManager.renderOpponents();
    }

    displayChatMessage(data) {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;
        
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message';
        messageElement.innerHTML = `
            <span class="message-author">${data.playerName}:</span>
            <span class="message-text">${data.message}</span>
            <span class="message-time">${new Date(data.timestamp).toLocaleTimeString()}</span>
        `;
        
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    sendChatFromInput() {
        const chatInput = document.getElementById('chatInput');
        if (chatInput && chatInput.value.trim()) {
            this.sendChatMessage(chatInput.value);
            chatInput.value = '';
        }
    }

    leaveLobby() {
        if (this.socket) {
            this.socket.disconnect();
        }
        
        // العودة للقائمة الرئيسية
        document.getElementById('multiplayerLobby').classList.add('hidden');
        document.getElementById('mainMenu').classList.remove('hidden');
        
        // إعادة تعيين المتغيرات
        this.roomId = null;
        this.isHost = false;
        this.playerName = '';
    }
}

// إنشاء مدير اللعب الجماعي
const multiplayerManager = new MultiplayerManager();

// تحديث مستمعي الأحداث للعب الجماعي
document.addEventListener('DOMContentLoaded', function() {
    // التحقق من وجود رمز غرفة في الرابط
    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('room');
    
    if (roomCode) {
        // إظهار نافذة الانضمام للغرفة
        const playerName = prompt('أدخل اسمك:');
        if (playerName) {
            multiplayerManager.joinRoom(roomCode, playerName);
        }
    }
    
    // تحديث زر اللعب الجماعي
    const multiplayerBtn = document.querySelector('button[onclick*="multiplayer"]');
    if (multiplayerBtn) {
        multiplayerBtn.onclick = () => {
            const choice = confirm('هل تريد إنشاء غرفة جديدة؟\nاضغط موافق لإنشاء غرفة، أو إلغاء للانضمام لغرفة موجودة.');
            
            if (choice) {
                // إنشاء غرفة جديدة
                multiplayerManager.createRoom();
            } else {
                // الانضمام لغرفة موجودة
                const roomCode = prompt('أدخل رمز الغرفة:');
                const playerName = prompt('أدخل اسمك:');
                
                if (roomCode && playerName) {
                    multiplayerManager.joinRoom(roomCode, playerName);
                }
            }
        };
    }
});

// إضافة CSS للوبي والدردشة
const multiplayerCSS = `
.lobby-container {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
    background: rgba(255,255,255,0.1);
    border-radius: 20px;
    backdrop-filter: blur(10px);
}

.room-info {
    margin-bottom: 2rem;
    padding: 1rem;
    background: rgba(255,255,255,0.1);
    border-radius: 10px;
}

.room-code, .room-link {
    margin-bottom: 1rem;
    display: flex;
    align-items: center;
    gap: 1rem;
}

.room-code label, .room-link label {
    font-weight: bold;
    min-width: 100px;
}

.room-code span, .room-link span {
    background: rgba(0,0,0,0.3);
    padding: 0.5rem;
    border-radius: 5px;
    font-family: monospace;
    flex: 1;
}

.players-list {
    margin-bottom: 2rem;
}

.player-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem;
    margin-bottom: 0.5rem;
    background: rgba(255,255,255,0.1);
    border-radius: 5px;
}

.lobby-controls {
    display: flex;
    gap: 1rem;
    margin-bottom: 2rem;
}

.lobby-controls button {
    flex: 1;
    padding: 1rem;
    border: none;
    border-radius: 10px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.3s;
}

.lobby-controls button:hover {
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(0,0,0,0.3);
}

.lobby-controls button.ready {
    background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
}

.chat-container {
    background: rgba(255,255,255,0.1);
    border-radius: 10px;
    padding: 1rem;
    height: 300px;
    display: flex;
    flex-direction: column;
}

#chatMessages {
    flex: 1;
    overflow-y: auto;
    margin-bottom: 1rem;
    padding: 0.5rem;
    background: rgba(0,0,0,0.2);
    border-radius: 5px;
}

.chat-message {
    margin-bottom: 0.5rem;
    padding: 0.25rem;
}

.message-author {
    font-weight: bold;
    color: #4CAF50;
}

.message-time {
    font-size: 0.8rem;
    color: rgba(255,255,255,0.6);
    float: right;
}

.chat-input {
    display: flex;
    gap: 0.5rem;
}

.chat-input input {
    flex: 1;
    padding: 0.5rem;
    border: none;
    border-radius: 5px;
    background: rgba(255,255,255,0.2);
    color: white;
}

.chat-input input::placeholder {
    color: rgba(255,255,255,0.6);
}

.chat-input button {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 5px;
    background: #4CAF50;
    color: white;
    cursor: pointer;
}
`;

const multiplayerStyleSheet = document.createElement('style');
multiplayerStyleSheet.textContent = multiplayerCSS;
document.head.appendChild(multiplayerStyleSheet);

// تصدير مدير اللعب الجماعي
window.UNOGame.MultiplayerManager = MultiplayerManager;
window.multiplayerManager = multiplayerManager;

console.log('تم تحميل دعم اللعب الجماعي بنجاح! 🌐👥');


// ===== الميزات الخاصة والقواعد الاختيارية =====

class SpecialRules {
    constructor() {
        this.stackingEnabled = false;
        this.sevenZeroEnabled = false;
        this.jumpInEnabled = false;
        this.stackCount = 0;
        this.stackType = null; // 'draw_two' أو 'wild_draw_four'
    }

    // تفعيل/إلغاء تفعيل القواعد
    toggleStacking(enabled) {
        this.stackingEnabled = enabled;
        console.log(`تكديس البطاقات: ${enabled ? 'مفعل' : 'معطل'}`);
    }

    toggleSevenZero(enabled) {
        this.sevenZeroEnabled = enabled;
        console.log(`قاعدة السبعة والصفر: ${enabled ? 'مفعلة' : 'معطلة'}`);
    }

    toggleJumpIn(enabled) {
        this.jumpInEnabled = enabled;
        console.log(`القفز في الدور: ${enabled ? 'مفعل' : 'معطل'}`);
    }

    // تكديس البطاقات
    canStackCard(card) {
        if (!this.stackingEnabled) return false;
        
        const topCard = gameState.discardPile[gameState.discardPile.length - 1];
        
        // يمكن تكديس +2 على +2 أو +4 على +4
        if (card.type === 'draw_two' && (topCard.type === 'draw_two' || this.stackType === 'draw_two')) {
            return true;
        }
        
        if (card.type === 'wild_draw_four' && (topCard.type === 'wild_draw_four' || this.stackType === 'wild_draw_four')) {
            return true;
        }
        
        return false;
    }

    startStack(cardType) {
        this.stackType = cardType;
        this.stackCount = cardType === 'draw_two' ? 2 : 4;
        console.log(`بدء تكديس ${cardType}: ${this.stackCount} بطاقات`);
    }

    addToStack(cardType) {
        if (cardType === 'draw_two') {
            this.stackCount += 2;
        } else if (cardType === 'wild_draw_four') {
            this.stackCount += 4;
        }
        console.log(`إضافة للتكديس: المجموع ${this.stackCount} بطاقات`);
    }

    executeStack(targetPlayerIndex) {
        if (this.stackCount > 0) {
            const targetPlayer = gameState.players[targetPlayerIndex];
            
            // سحب البطاقات المكدسة
            for (let i = 0; i < this.stackCount; i++) {
                if (gameState.deck.length === 0) {
                    GameLogic.reshuffleDeck();
                }
                targetPlayer.hand.push(gameState.deck.pop());
            }
            
            UIManager.showNotification(`${targetPlayer.name} سحب ${this.stackCount} بطاقة!`, 'warning');
            
            // إعادة تعيين التكديس
            this.resetStack();
            
            return true;
        }
        return false;
    }

    resetStack() {
        this.stackCount = 0;
        this.stackType = null;
    }

    // قاعدة السبعة والصفر
    handleSevenZeroRule(card, playerIndex) {
        if (!this.sevenZeroEnabled) return false;
        
        if (card.type === 'number' && card.value === 7) {
            // السبعة: تبديل الأيدي مع لاعب آخر
            this.showHandSwapDialog(playerIndex);
            return true;
        }
        
        if (card.type === 'number' && card.value === 0) {
            // الصفر: دوران الأيدي في اتجاه اللعب
            this.rotateHands();
            return true;
        }
        
        return false;
    }

    showHandSwapDialog(currentPlayerIndex) {
        const availablePlayers = gameState.players
            .map((player, index) => ({ player, index }))
            .filter(({ index }) => index !== currentPlayerIndex);
        
        if (availablePlayers.length === 0) return;
        
        // إنشاء نافذة اختيار اللاعب
        const dialog = document.createElement('div');
        dialog.className = 'swap-dialog';
        dialog.innerHTML = `
            <div class="dialog-content">
                <h3>اختر لاعباً لتبديل الأيدي معه</h3>
                <div class="player-options">
                    ${availablePlayers.map(({ player, index }) => 
                        `<button onclick="specialRules.swapHands(${currentPlayerIndex}, ${index}); this.closest('.swap-dialog').remove()">
                            ${player.name} (${player.hand.length} بطاقة)
                        </button>`
                    ).join('')}
                </div>
                <button onclick="this.closest('.swap-dialog').remove()">إلغاء</button>
            </div>
        `;
        
        document.body.appendChild(dialog);
    }

    swapHands(player1Index, player2Index) {
        const player1 = gameState.players[player1Index];
        const player2 = gameState.players[player2Index];
        
        // تبديل الأيدي
        const tempHand = [...player1.hand];
        player1.hand = [...player2.hand];
        player2.hand = tempHand;
        
        UIManager.showNotification(`تم تبديل الأيدي بين ${player1.name} و ${player2.name}!`, 'info');
        UIManager.renderGame();
        
        // إضافة تأثير بصري
        AnimationManager.createSwapEffect(player1Index, player2Index);
    }

    rotateHands() {
        if (gameState.players.length < 3) return;
        
        const hands = gameState.players.map(player => [...player.hand]);
        
        if (gameState.direction === 1) {
            // دوران في اتجاه عقارب الساعة
            for (let i = 0; i < gameState.players.length; i++) {
                const nextIndex = (i + 1) % gameState.players.length;
                gameState.players[nextIndex].hand = hands[i];
            }
        } else {
            // دوران عكس عقارب الساعة
            for (let i = 0; i < gameState.players.length; i++) {
                const prevIndex = (i - 1 + gameState.players.length) % gameState.players.length;
                gameState.players[prevIndex].hand = hands[i];
            }
        }
        
        UIManager.showNotification('تم دوران جميع الأيدي!', 'info');
        UIManager.renderGame();
        
        // إضافة تأثير بصري
        AnimationManager.createRotationEffect();
    }

    // القفز في الدور
    canJumpIn(card, playerIndex) {
        if (!this.jumpInEnabled) return false;
        if (playerIndex === gameState.currentPlayer) return false;
        
        const topCard = gameState.discardPile[gameState.discardPile.length - 1];
        
        // يجب أن تكون البطاقة مطابقة تماماً (نفس اللون والرقم/النوع)
        return card.color === topCard.color && 
               card.type === topCard.type && 
               card.value === topCard.value;
    }

    executeJumpIn(playerIndex, cardIndex) {
        if (!this.canJumpIn(gameState.players[playerIndex].hand[cardIndex], playerIndex)) {
            return false;
        }
        
        // تغيير الدور الحالي للاعب القافز
        gameState.currentPlayer = playerIndex;
        
        // لعب البطاقة
        const result = GameLogic.playCard(cardIndex);
        
        if (result.success) {
            UIManager.showNotification(`${gameState.players[playerIndex].name} قفز في الدور!`, 'info');
            return true;
        }
        
        return false;
    }
}

// إنشاء مدير القواعد الخاصة
const specialRules = new SpecialRules();

// تحديث GameLogic لدعم القواعد الخاصة
const originalPlayCard = GameLogic.playCard;
GameLogic.playCard = function(cardIndex, newColor = null) {
    const player = gameState.players[gameState.currentPlayer];
    const card = player.hand[cardIndex];
    
    if (!card) {
        return { success: false, error: 'البطاقة غير موجودة' };
    }
    
    // التحقق من التكديس
    if (specialRules.stackingEnabled && specialRules.stackType) {
        if (specialRules.canStackCard(card)) {
            // إضافة للتكديس
            player.hand.splice(cardIndex, 1);
            gameState.discardPile.push(card);
            specialRules.addToStack(card.type);
            
            // الانتقال للدور التالي
            this.nextTurn();
            return { success: true, stacked: true };
        } else if (card.type !== specialRules.stackType) {
            // لا يمكن لعب بطاقة أخرى أثناء التكديس
            return { success: false, error: 'يجب لعب بطاقة مطابقة للتكديس أو سحب البطاقات' };
        }
    }
    
    // استدعاء الدالة الأصلية
    const result = originalPlayCard.call(this, cardIndex, newColor);
    
    if (result.success) {
        // التحقق من القواعد الخاصة
        if (card.type === 'draw_two' || card.type === 'wild_draw_four') {
            if (specialRules.stackingEnabled) {
                specialRules.startStack(card.type);
            }
        }
        
        // قاعدة السبعة والصفر
        if (specialRules.handleSevenZeroRule(card, gameState.currentPlayer)) {
            // تم تطبيق قاعدة خاصة
        }
    }
    
    return result;
};

// إضافة دالة للتعامل مع عدم القدرة على التكديس
GameLogic.handleStackPenalty = function() {
    if (specialRules.stackType && specialRules.stackCount > 0) {
        specialRules.executeStack(gameState.currentPlayer);
        this.nextTurn();
        return true;
    }
    return false;
};

// تحديث واجهة المستخدم لإظهار خيارات القواعد الخاصة
UIManager.updateSpecialRulesUI = function() {
    const gameInfo = document.getElementById('gameInfo');
    if (!gameInfo) return;
    
    let specialInfo = '';
    
    if (specialRules.stackingEnabled && specialRules.stackCount > 0) {
        specialInfo += `<div class="stack-info">تكديس: ${specialRules.stackCount} بطاقة</div>`;
    }
    
    if (specialRules.sevenZeroEnabled) {
        specialInfo += `<div class="rule-info">قاعدة 7-0 مفعلة</div>`;
    }
    
    if (specialRules.jumpInEnabled) {
        specialInfo += `<div class="rule-info">القفز مفعل</div>`;
    }
    
    if (specialInfo) {
        const existingSpecialInfo = gameInfo.querySelector('.special-rules-info');
        if (existingSpecialInfo) {
            existingSpecialInfo.innerHTML = specialInfo;
        } else {
            const specialDiv = document.createElement('div');
            specialDiv.className = 'special-rules-info';
            specialDiv.innerHTML = specialInfo;
            gameInfo.appendChild(specialDiv);
        }
    }
};

// إضافة CSS للقواعد الخاصة
const specialRulesCSS = `
.swap-dialog {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
}

.dialog-content {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 2rem;
    border-radius: 20px;
    text-align: center;
    max-width: 400px;
    width: 90%;
}

.player-options {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin: 1rem 0;
}

.player-options button {
    padding: 1rem;
    border: none;
    border-radius: 10px;
    background: rgba(255,255,255,0.2);
    color: white;
    cursor: pointer;
    transition: all 0.3s;
}

.player-options button:hover {
    background: rgba(255,255,255,0.3);
    transform: translateY(-2px);
}

.special-rules-info {
    margin-top: 1rem;
    padding: 1rem;
    background: rgba(255,255,255,0.1);
    border-radius: 10px;
}

.stack-info {
    color: #ff6b6b;
    font-weight: bold;
    font-size: 1.2rem;
    margin-bottom: 0.5rem;
}

.rule-info {
    color: #4ecdc4;
    font-size: 0.9rem;
    margin-bottom: 0.25rem;
}

.jump-in-indicator {
    position: absolute;
    top: -10px;
    right: -10px;
    background: #ff6b6b;
    color: white;
    border-radius: 50%;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    font-weight: bold;
    animation: pulse 1s infinite;
}

@keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.2); }
    100% { transform: scale(1); }
}
`;

const specialRulesStyleSheet = document.createElement('style');
specialRulesStyleSheet.textContent = specialRulesCSS;
document.head.appendChild(specialRulesStyleSheet);

// إضافة مستمعي الأحداث للقفز في الدور
document.addEventListener('click', function(event) {
    if (!specialRules.jumpInEnabled) return;
    
    const cardElement = event.target.closest('.card');
    if (!cardElement) return;
    
    const playerIndex = parseInt(cardElement.dataset.playerIndex);
    const cardIndex = parseInt(cardElement.dataset.cardIndex);
    
    if (playerIndex !== undefined && cardIndex !== undefined && playerIndex !== gameState.currentPlayer) {
        const card = gameState.players[playerIndex].hand[cardIndex];
        if (specialRules.canJumpIn(card, playerIndex)) {
            // إضافة مؤشر القفز
            if (!cardElement.querySelector('.jump-in-indicator')) {
                const indicator = document.createElement('div');
                indicator.className = 'jump-in-indicator';
                indicator.textContent = '!';
                indicator.title = 'انقر للقفز في الدور';
                cardElement.appendChild(indicator);
                
                // إضافة مستمع للقفز
                indicator.addEventListener('click', function(e) {
                    e.stopPropagation();
                    if (specialRules.executeJumpIn(playerIndex, cardIndex)) {
                        UIManager.renderGame();
                    }
                });
            }
        }
    }
});

// تحديث إعدادات اللعبة لتشمل القواعد الخاصة
const originalShowGameSetup = UIManager.showGameSetup;
UIManager.showGameSetup = function() {
    originalShowGameSetup.call(this);
    
    // إضافة خيارات القواعد الخاصة
    const setupScreen = document.getElementById('gameSetup');
    if (setupScreen) {
        const specialRulesSection = document.createElement('div');
        specialRulesSection.className = 'special-rules-section';
        specialRulesSection.innerHTML = `
            <h3>القواعد الاختيارية</h3>
            <div class="rule-option">
                <input type="checkbox" id="stackingRule" onchange="specialRules.toggleStacking(this.checked)">
                <label for="stackingRule">تكديس البطاقات (+2 و +4)</label>
            </div>
            <div class="rule-option">
                <input type="checkbox" id="sevenZeroRule" onchange="specialRules.toggleSevenZero(this.checked)">
                <label for="sevenZeroRule">قاعدة السبعة والصفر</label>
            </div>
            <div class="rule-option">
                <input type="checkbox" id="jumpInRule" onchange="specialRules.toggleJumpIn(this.checked)">
                <label for="jumpInRule">القفز في الدور</label>
            </div>
        `;
        
        setupScreen.appendChild(specialRulesSection);
    }
};

// تصدير القواعد الخاصة
window.UNOGame.SpecialRules = SpecialRules;
window.specialRules = specialRules;

console.log('تم تحميل الميزات الخاصة والقواعد الاختيارية بنجاح! 🎯✨');


// ===== نظام النقاط وحفظ اللعبة =====

class ScoringSystem {
    constructor() {
        this.pointGoal = 500;
        this.roundHistory = [];
        this.gameStats = this.loadGameStats();
    }

    // حساب نقاط البطاقات
    calculateCardPoints(card) {
        switch (card.type) {
            case 'number':
                return card.value;
            case 'skip':
            case 'reverse':
            case 'draw_two':
                return 20;
            case 'wild':
            case 'wild_draw_four':
                return 50;
            default:
                return 0;
        }
    }

    // حساب نقاط اللاعب في نهاية الجولة
    calculatePlayerScore(player) {
        let score = 0;
        player.hand.forEach(card => {
            score += this.calculateCardPoints(card);
        });
        return score;
    }

    // إنهاء الجولة وحساب النقاط
    endRound(winnerIndex) {
        const roundData = {
            winner: winnerIndex,
            scores: [],
            timestamp: Date.now(),
            roundNumber: this.roundHistory.length + 1
        };

        let totalPoints = 0;
        
        // حساب نقاط كل لاعب
        gameState.players.forEach((player, index) => {
            const roundScore = this.calculatePlayerScore(player);
            totalPoints += roundScore;
            
            roundData.scores.push({
                playerIndex: index,
                playerName: player.name,
                roundScore: roundScore,
                handCards: [...player.hand]
            });
            
            // إضافة النقاط للاعب (عدا الفائز)
            if (index !== winnerIndex) {
                player.totalScore = (player.totalScore || 0) + roundScore;
            }
        });

        // الفائز يحصل على مجموع نقاط الآخرين
        gameState.players[winnerIndex].totalScore = (gameState.players[winnerIndex].totalScore || 0) + totalPoints;
        
        this.roundHistory.push(roundData);
        this.saveGameProgress();
        
        // عرض نتائج الجولة
        this.showRoundResults(roundData);
        
        // التحقق من انتهاء اللعبة
        const gameWinner = this.checkGameEnd();
        if (gameWinner !== null) {
            this.endGame(gameWinner);
            return true;
        }
        
        return false;
    }

    // التحقق من انتهاء اللعبة
    checkGameEnd() {
        for (let i = 0; i < gameState.players.length; i++) {
            if ((gameState.players[i].totalScore || 0) >= this.pointGoal) {
                // اللاعب الذي لديه أقل نقاط يفوز
                let winnerIndex = 0;
                let lowestScore = gameState.players[0].totalScore || 0;
                
                for (let j = 1; j < gameState.players.length; j++) {
                    const playerScore = gameState.players[j].totalScore || 0;
                    if (playerScore < lowestScore) {
                        lowestScore = playerScore;
                        winnerIndex = j;
                    }
                }
                
                return winnerIndex;
            }
        }
        return null;
    }

    // إنهاء اللعبة
    endGame(winnerIndex) {
        const winner = gameState.players[winnerIndex];
        
        // تحديث الإحصائيات
        this.updateGameStats(winnerIndex);
        
        // عرض نتائج اللعبة النهائية
        this.showGameResults(winnerIndex);
        
        // حفظ الإحصائيات
        this.saveGameStats();
        
        console.log(`انتهت اللعبة! الفائز: ${winner.name}`);
    }

    // عرض نتائج الجولة
    showRoundResults(roundData) {
        const modal = document.createElement('div');
        modal.className = 'results-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>نتائج الجولة ${roundData.roundNumber}</h2>
                <div class="winner-announcement">
                    🎉 الفائز: ${gameState.players[roundData.winner].name} 🎉
                </div>
                <div class="scores-table">
                    <table>
                        <thead>
                            <tr>
                                <th>اللاعب</th>
                                <th>نقاط الجولة</th>
                                <th>المجموع الكلي</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${roundData.scores.map(score => `
                                <tr class="${score.playerIndex === roundData.winner ? 'winner-row' : ''}">
                                    <td>${score.playerName}</td>
                                    <td>${score.roundScore}</td>
                                    <td>${gameState.players[score.playerIndex].totalScore || 0}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="modal-actions">
                    <button onclick="this.closest('.results-modal').remove(); scoringSystem.startNewRound()">جولة جديدة</button>
                    <button onclick="this.closest('.results-modal').remove(); UIManager.showMainMenu()">القائمة الرئيسية</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }

    // عرض نتائج اللعبة النهائية
    showGameResults(winnerIndex) {
        const winner = gameState.players[winnerIndex];
        const modal = document.createElement('div');
        modal.className = 'results-modal final-results';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>🏆 انتهت اللعبة! 🏆</h2>
                <div class="final-winner">
                    <div class="winner-crown">👑</div>
                    <div class="winner-name">${winner.name}</div>
                    <div class="winner-score">النقاط النهائية: ${winner.totalScore || 0}</div>
                </div>
                <div class="final-standings">
                    <h3>الترتيب النهائي</h3>
                    <ol>
                        ${gameState.players
                            .map((player, index) => ({ player, index, score: player.totalScore || 0 }))
                            .sort((a, b) => a.score - b.score)
                            .map((item, rank) => `
                                <li class="${item.index === winnerIndex ? 'final-winner' : ''}">
                                    ${item.player.name} - ${item.score} نقطة
                                    ${rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : ''}
                                </li>
                            `).join('')}
                    </ol>
                </div>
                <div class="game-summary">
                    <p>عدد الجولات: ${this.roundHistory.length}</p>
                    <p>مدة اللعبة: ${this.getGameDuration()}</p>
                </div>
                <div class="modal-actions">
                    <button onclick="this.closest('.results-modal').remove(); scoringSystem.startNewGame()">لعبة جديدة</button>
                    <button onclick="this.closest('.results-modal').remove(); UIManager.showMainMenu()">القائمة الرئيسية</button>
                    <button onclick="scoringSystem.showDetailedStats()">عرض الإحصائيات</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // إضافة تأثيرات الاحتفال
        AnimationManager.createConfetti();
        SoundManager.playVictorySound();
    }

    // بدء جولة جديدة
    startNewRound() {
        // إعادة تعيين أيدي اللاعبين
        gameState.players.forEach(player => {
            player.hand = [];
        });
        
        // إعادة إنشاء مجموعة البطاقات
        GameLogic.initializeDeck();
        GameLogic.dealCards();
        
        // إعادة تعيين حالة اللعبة
        gameState.currentPlayer = 0;
        gameState.direction = 1;
        gameState.lastAction = null;
        
        // إعادة عرض اللعبة
        UIManager.renderGame();
        
        UIManager.showNotification('بدأت جولة جديدة!', 'success');
    }

    // بدء لعبة جديدة
    startNewGame() {
        // إعادة تعيين النقاط
        gameState.players.forEach(player => {
            player.totalScore = 0;
        });
        
        // مسح تاريخ الجولات
        this.roundHistory = [];
        
        // بدء جولة جديدة
        this.startNewRound();
    }

    // حساب مدة اللعبة
    getGameDuration() {
        if (this.roundHistory.length === 0) return '0 دقيقة';
        
        const startTime = this.roundHistory[0].timestamp;
        const endTime = this.roundHistory[this.roundHistory.length - 1].timestamp;
        const duration = Math.floor((endTime - startTime) / 60000); // بالدقائق
        
        return `${duration} دقيقة`;
    }

    // تحديث إحصائيات اللعبة
    updateGameStats(winnerIndex) {
        const winner = gameState.players[winnerIndex];
        
        // تحديث إحصائيات الفائز
        if (!this.gameStats.players[winner.name]) {
            this.gameStats.players[winner.name] = {
                gamesPlayed: 0,
                gamesWon: 0,
                totalScore: 0,
                bestScore: Infinity,
                averageScore: 0
            };
        }
        
        const winnerStats = this.gameStats.players[winner.name];
        winnerStats.gamesPlayed++;
        winnerStats.gamesWon++;
        winnerStats.totalScore += winner.totalScore || 0;
        winnerStats.bestScore = Math.min(winnerStats.bestScore, winner.totalScore || 0);
        winnerStats.averageScore = winnerStats.totalScore / winnerStats.gamesPlayed;
        
        // تحديث إحصائيات باقي اللاعبين
        gameState.players.forEach((player, index) => {
            if (index !== winnerIndex) {
                if (!this.gameStats.players[player.name]) {
                    this.gameStats.players[player.name] = {
                        gamesPlayed: 0,
                        gamesWon: 0,
                        totalScore: 0,
                        bestScore: Infinity,
                        averageScore: 0
                    };
                }
                
                const playerStats = this.gameStats.players[player.name];
                playerStats.gamesPlayed++;
                playerStats.totalScore += player.totalScore || 0;
                playerStats.averageScore = playerStats.totalScore / playerStats.gamesPlayed;
            }
        });
        
        // تحديث الإحصائيات العامة
        this.gameStats.totalGames++;
        this.gameStats.lastPlayed = Date.now();
    }

    // عرض الإحصائيات التفصيلية
    showDetailedStats() {
        const modal = document.createElement('div');
        modal.className = 'stats-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>📊 إحصائيات اللعبة</h2>
                <div class="stats-content">
                    <div class="general-stats">
                        <h3>إحصائيات عامة</h3>
                        <p>إجمالي الألعاب: ${this.gameStats.totalGames}</p>
                        <p>آخر لعبة: ${new Date(this.gameStats.lastPlayed).toLocaleDateString()}</p>
                    </div>
                    <div class="player-stats">
                        <h3>إحصائيات اللاعبين</h3>
                        <table>
                            <thead>
                                <tr>
                                    <th>اللاعب</th>
                                    <th>الألعاب</th>
                                    <th>الانتصارات</th>
                                    <th>معدل الفوز</th>
                                    <th>أفضل نتيجة</th>
                                    <th>المتوسط</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${Object.entries(this.gameStats.players).map(([name, stats]) => `
                                    <tr>
                                        <td>${name}</td>
                                        <td>${stats.gamesPlayed}</td>
                                        <td>${stats.gamesWon}</td>
                                        <td>${((stats.gamesWon / stats.gamesPlayed) * 100).toFixed(1)}%</td>
                                        <td>${stats.bestScore === Infinity ? '-' : stats.bestScore}</td>
                                        <td>${stats.averageScore.toFixed(1)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="modal-actions">
                    <button onclick="this.closest('.stats-modal').remove()">إغلاق</button>
                    <button onclick="scoringSystem.exportStats()">تصدير الإحصائيات</button>
                    <button onclick="scoringSystem.clearStats()">مسح الإحصائيات</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }

    // حفظ تقدم اللعبة
    saveGameProgress() {
        const gameData = {
            gameState: gameState,
            roundHistory: this.roundHistory,
            pointGoal: this.pointGoal,
            timestamp: Date.now()
        };
        
        localStorage.setItem('unoGameProgress', JSON.stringify(gameData));
    }

    // تحميل تقدم اللعبة
    loadGameProgress() {
        const saved = localStorage.getItem('unoGameProgress');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error('خطأ في تحميل تقدم اللعبة:', e);
            }
        }
        return null;
    }

    // حفظ إحصائيات اللعبة
    saveGameStats() {
        localStorage.setItem('unoGameStats', JSON.stringify(this.gameStats));
    }

    // تحميل إحصائيات اللعبة
    loadGameStats() {
        const saved = localStorage.getItem('unoGameStats');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error('خطأ في تحميل الإحصائيات:', e);
            }
        }
        
        // إحصائيات افتراضية
        return {
            totalGames: 0,
            lastPlayed: Date.now(),
            players: {}
        };
    }

    // تصدير الإحصائيات
    exportStats() {
        const data = {
            gameStats: this.gameStats,
            roundHistory: this.roundHistory,
            exportDate: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `uno-stats-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        UIManager.showNotification('تم تصدير الإحصائيات بنجاح!', 'success');
    }

    // مسح الإحصائيات
    clearStats() {
        if (confirm('هل أنت متأكد من مسح جميع الإحصائيات؟ لا يمكن التراجع عن هذا الإجراء.')) {
            this.gameStats = {
                totalGames: 0,
                lastPlayed: Date.now(),
                players: {}
            };
            this.roundHistory = [];
            
            localStorage.removeItem('unoGameStats');
            localStorage.removeItem('unoGameProgress');
            
            UIManager.showNotification('تم مسح جميع الإحصائيات!', 'info');
            
            // إغلاق نافذة الإحصائيات
            const modal = document.querySelector('.stats-modal');
            if (modal) modal.remove();
        }
    }

    // استئناف لعبة محفوظة
    resumeSavedGame() {
        const savedGame = this.loadGameProgress();
        if (savedGame) {
            gameState = savedGame.gameState;
            this.roundHistory = savedGame.roundHistory;
            this.pointGoal = savedGame.pointGoal;
            
            UIManager.renderGame();
            UIManager.showNotification('تم استئناف اللعبة المحفوظة!', 'success');
            
            return true;
        }
        return false;
    }

    // التحقق من وجود لعبة محفوظة
    hasSavedGame() {
        return localStorage.getItem('unoGameProgress') !== null;
    }
}

// إنشاء نظام النقاط
const scoringSystem = new ScoringSystem();

// تحديث GameLogic لدعم نظام النقاط
const originalEndGame = GameLogic.endGame;
GameLogic.endGame = function(winnerIndex) {
    // استدعاء نظام النقاط
    const gameEnded = scoringSystem.endRound(winnerIndex);
    
    if (!gameEnded) {
        // إذا لم تنته اللعبة، استمر للجولة التالية
        return false;
    }
    
    return true;
};

// إضافة CSS لنظام النقاط
const scoringCSS = `
.results-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.9);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
}

.results-modal .modal-content {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 2rem;
    border-radius: 20px;
    text-align: center;
    max-width: 600px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
}

.winner-announcement {
    font-size: 1.5rem;
    font-weight: bold;
    margin: 1rem 0;
    color: #ffd700;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
}

.scores-table table {
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0;
    background: rgba(255,255,255,0.1);
    border-radius: 10px;
    overflow: hidden;
}

.scores-table th,
.scores-table td {
    padding: 1rem;
    text-align: center;
    border-bottom: 1px solid rgba(255,255,255,0.2);
}

.scores-table th {
    background: rgba(255,255,255,0.2);
    font-weight: bold;
}

.winner-row {
    background: rgba(255,215,0,0.3);
    font-weight: bold;
}

.final-results .final-winner {
    margin: 2rem 0;
}

.winner-crown {
    font-size: 3rem;
    margin-bottom: 1rem;
}

.winner-name {
    font-size: 2rem;
    font-weight: bold;
    color: #ffd700;
    margin-bottom: 0.5rem;
}

.winner-score {
    font-size: 1.2rem;
    color: rgba(255,255,255,0.8);
}

.final-standings ol {
    text-align: left;
    max-width: 400px;
    margin: 0 auto;
}

.final-standings li {
    padding: 0.5rem;
    margin-bottom: 0.5rem;
    background: rgba(255,255,255,0.1);
    border-radius: 5px;
}

.final-standings .final-winner {
    background: rgba(255,215,0,0.3);
    font-weight: bold;
}

.game-summary {
    margin: 1rem 0;
    padding: 1rem;
    background: rgba(255,255,255,0.1);
    border-radius: 10px;
}

.stats-modal .stats-content {
    text-align: left;
}

.player-stats table {
    width: 100%;
    font-size: 0.9rem;
}

.modal-actions {
    display: flex;
    gap: 1rem;
    margin-top: 2rem;
    flex-wrap: wrap;
    justify-content: center;
}

.modal-actions button {
    padding: 1rem 2rem;
    border: none;
    border-radius: 10px;
    background: rgba(255,255,255,0.2);
    color: white;
    cursor: pointer;
    transition: all 0.3s;
    font-size: 1rem;
}

.modal-actions button:hover {
    background: rgba(255,255,255,0.3);
    transform: translateY(-2px);
}
`;

const scoringStyleSheet = document.createElement('style');
scoringStyleSheet.textContent = scoringCSS;
document.head.appendChild(scoringStyleSheet);

// إضافة خيار استئناف اللعبة للقائمة الرئيسية
document.addEventListener('DOMContentLoaded', function() {
    if (scoringSystem.hasSavedGame()) {
        const mainMenu = document.getElementById('mainMenu');
        if (mainMenu) {
            const resumeButton = document.createElement('button');
            resumeButton.textContent = 'استئناف اللعبة المحفوظة';
            resumeButton.className = 'menu-button resume-button';
            resumeButton.onclick = () => {
                if (scoringSystem.resumeSavedGame()) {
                    document.getElementById('mainMenu').classList.add('hidden');
                    document.getElementById('gameScreen').classList.remove('hidden');
                }
            };
            
            mainMenu.insertBefore(resumeButton, mainMenu.children[1]);
        }
    }
});

// تصدير نظام النقاط
window.UNOGame.ScoringSystem = ScoringSystem;
window.scoringSystem = scoringSystem;

console.log('تم تحميل نظام النقاط وحفظ اللعبة بنجاح! 🏆📊');


// ===== الرسوم المتحركة والأصوات واللمسات الأخيرة =====

class EnhancedAnimationManager {
    constructor() {
        this.animationQueue = [];
        this.isAnimating = false;
    }

    // رسوم متحركة محسنة للبطاقات
    animateCardPlay(cardElement, targetElement) {
        return new Promise((resolve) => {
            const startRect = cardElement.getBoundingClientRect();
            const endRect = targetElement.getBoundingClientRect();
            
            const clone = cardElement.cloneNode(true);
            clone.style.position = 'fixed';
            clone.style.left = startRect.left + 'px';
            clone.style.top = startRect.top + 'px';
            clone.style.width = startRect.width + 'px';
            clone.style.height = startRect.height + 'px';
            clone.style.zIndex = '1000';
            clone.style.transition = 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            clone.style.transform = 'scale(1)';
            
            document.body.appendChild(clone);
            
            // إخفاء البطاقة الأصلية
            cardElement.style.opacity = '0';
            
            setTimeout(() => {
                clone.style.left = endRect.left + 'px';
                clone.style.top = endRect.top + 'px';
                clone.style.transform = 'scale(1.1) rotateY(180deg)';
            }, 50);
            
            setTimeout(() => {
                clone.style.transform = 'scale(1) rotateY(0deg)';
                clone.remove();
                cardElement.style.opacity = '1';
                resolve();
            }, 650);
        });
    }

    // رسوم متحركة لسحب البطاقات
    animateCardDraw(targetElement) {
        return new Promise((resolve) => {
            const deckElement = document.querySelector('.deck');
            if (!deckElement) {
                resolve();
                return;
            }
            
            const startRect = deckElement.getBoundingClientRect();
            const endRect = targetElement.getBoundingClientRect();
            
            const cardElement = document.createElement('div');
            cardElement.className = 'card card-back';
            cardElement.style.position = 'fixed';
            cardElement.style.left = startRect.left + 'px';
            cardElement.style.top = startRect.top + 'px';
            cardElement.style.width = '60px';
            cardElement.style.height = '90px';
            cardElement.style.zIndex = '1000';
            cardElement.style.transition = 'all 0.5s ease-out';
            cardElement.style.transform = 'scale(0.8)';
            
            document.body.appendChild(cardElement);
            
            setTimeout(() => {
                cardElement.style.left = endRect.left + 'px';
                cardElement.style.top = endRect.top + 'px';
                cardElement.style.transform = 'scale(1) rotateY(180deg)';
            }, 50);
            
            setTimeout(() => {
                cardElement.remove();
                resolve();
            }, 550);
        });
    }

    // تأثير الكونفيتي المحسن
    createEnhancedConfetti() {
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3'];
        const confettiCount = 100;
        
        for (let i = 0; i < confettiCount; i++) {
            setTimeout(() => {
                const confetti = document.createElement('div');
                confetti.className = 'confetti-piece';
                confetti.style.cssText = `
                    position: fixed;
                    width: 10px;
                    height: 10px;
                    background: ${colors[Math.floor(Math.random() * colors.length)]};
                    left: ${Math.random() * 100}vw;
                    top: -10px;
                    z-index: 10000;
                    border-radius: ${Math.random() > 0.5 ? '50%' : '0'};
                    animation: confetti-fall ${2 + Math.random() * 3}s linear forwards;
                    transform: rotate(${Math.random() * 360}deg);
                `;
                
                document.body.appendChild(confetti);
                
                setTimeout(() => confetti.remove(), 5000);
            }, i * 20);
        }
    }

    // تأثير الانفجار عند لعب بطاقة خاصة
    createExplosionEffect(element) {
        const particles = 20;
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        for (let i = 0; i < particles; i++) {
            const particle = document.createElement('div');
            particle.className = 'explosion-particle';
            particle.style.cssText = `
                position: fixed;
                width: 6px;
                height: 6px;
                background: #ffd700;
                left: ${centerX}px;
                top: ${centerY}px;
                z-index: 1000;
                border-radius: 50%;
                pointer-events: none;
            `;
            
            document.body.appendChild(particle);
            
            const angle = (i / particles) * Math.PI * 2;
            const velocity = 50 + Math.random() * 100;
            const vx = Math.cos(angle) * velocity;
            const vy = Math.sin(angle) * velocity;
            
            let x = centerX;
            let y = centerY;
            let opacity = 1;
            
            const animate = () => {
                x += vx * 0.02;
                y += vy * 0.02;
                opacity -= 0.02;
                
                particle.style.left = x + 'px';
                particle.style.top = y + 'px';
                particle.style.opacity = opacity;
                
                if (opacity > 0) {
                    requestAnimationFrame(animate);
                } else {
                    particle.remove();
                }
            };
            
            requestAnimationFrame(animate);
        }
    }

    // تأثير النبض للبطاقات القابلة للعب
    addPlayableCardEffect(cardElement) {
        cardElement.classList.add('playable-card');
        cardElement.style.animation = 'card-pulse 2s infinite';
    }

    removePlayableCardEffect(cardElement) {
        cardElement.classList.remove('playable-card');
        cardElement.style.animation = '';
    }

    // تأثير الهز عند الخطأ
    shakeElement(element) {
        element.style.animation = 'shake 0.5s ease-in-out';
        setTimeout(() => {
            element.style.animation = '';
        }, 500);
    }
}

class EnhancedSoundManager {
    constructor() {
        this.sounds = {};
        this.volume = 0.5;
        this.enabled = true;
        this.initializeSounds();
    }

    initializeSounds() {
        // إنشاء أصوات باستخدام Web Audio API
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // أصوات مختلفة للأحداث
        this.soundFrequencies = {
            cardPlay: [440, 554, 659], // C, C#, E
            cardDraw: [330, 392], // E, G
            uno: [523, 659, 784], // C, E, G
            victory: [523, 659, 784, 1047], // C, E, G, C
            error: [200, 150], // أصوات منخفضة للخطأ
            shuffle: [100, 150, 200, 250], // أصوات الخلط
            special: [880, 1108, 1319] // أصوات البطاقات الخاصة
        };
    }

    playTone(frequency, duration = 0.2, type = 'sine') {
        if (!this.enabled || !this.audioContext) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
        oscillator.type = type;
        
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(this.volume * 0.3, this.audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration);
    }

    playSequence(frequencies, interval = 0.1) {
        frequencies.forEach((freq, index) => {
            setTimeout(() => this.playTone(freq), index * interval * 1000);
        });
    }

    playCardSound() {
        const freq = this.soundFrequencies.cardPlay[Math.floor(Math.random() * this.soundFrequencies.cardPlay.length)];
        this.playTone(freq, 0.15);
    }

    playDrawSound() {
        this.playSequence(this.soundFrequencies.cardDraw, 0.05);
    }

    playUnoSound() {
        this.playSequence(this.soundFrequencies.uno, 0.15);
    }

    playVictorySound() {
        this.playSequence(this.soundFrequencies.victory, 0.2);
    }

    playErrorSound() {
        this.playSequence(this.soundFrequencies.error, 0.1);
    }

    playShuffleSound() {
        this.playSequence(this.soundFrequencies.shuffle, 0.05);
    }

    playSpecialCardSound() {
        this.playSequence(this.soundFrequencies.special, 0.08);
    }

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }

    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
    }
}

class ThemeManager {
    constructor() {
        this.currentTheme = localStorage.getItem('unoTheme') || 'default';
        this.themes = {
            default: {
                name: 'الافتراضي',
                colors: {
                    primary: '#667eea',
                    secondary: '#764ba2',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    cardBack: '#2c3e50'
                }
            },
            ocean: {
                name: 'المحيط',
                colors: {
                    primary: '#00b4db',
                    secondary: '#0083b0',
                    background: 'linear-gradient(135deg, #00b4db 0%, #0083b0 100%)',
                    cardBack: '#1e3c72'
                }
            },
            sunset: {
                name: 'غروب الشمس',
                colors: {
                    primary: '#ff7e5f',
                    secondary: '#feb47b',
                    background: 'linear-gradient(135deg, #ff7e5f 0%, #feb47b 100%)',
                    cardBack: '#8b4513'
                }
            },
            forest: {
                name: 'الغابة',
                colors: {
                    primary: '#56ab2f',
                    secondary: '#a8e6cf',
                    background: 'linear-gradient(135deg, #56ab2f 0%, #a8e6cf 100%)',
                    cardBack: '#2d5016'
                }
            },
            dark: {
                name: 'الوضع المظلم',
                colors: {
                    primary: '#2c3e50',
                    secondary: '#34495e',
                    background: 'linear-gradient(135deg, #2c3e50 0%, #34495e 100%)',
                    cardBack: '#1a1a1a'
                }
            }
        };
        
        this.applyTheme(this.currentTheme);
    }

    applyTheme(themeName) {
        const theme = this.themes[themeName];
        if (!theme) return;
        
        const root = document.documentElement;
        root.style.setProperty('--primary-color', theme.colors.primary);
        root.style.setProperty('--secondary-color', theme.colors.secondary);
        root.style.setProperty('--background-gradient', theme.colors.background);
        root.style.setProperty('--card-back-color', theme.colors.cardBack);
        
        this.currentTheme = themeName;
        localStorage.setItem('unoTheme', themeName);
        
        // تحديث واجهة المستخدم
        document.body.style.background = theme.colors.background;
    }

    getAvailableThemes() {
        return Object.entries(this.themes).map(([key, theme]) => ({
            key,
            name: theme.name
        }));
    }

    getCurrentTheme() {
        return this.currentTheme;
    }
}

class AccessibilityManager {
    constructor() {
        this.highContrast = localStorage.getItem('unoHighContrast') === 'true';
        this.largeText = localStorage.getItem('unoLargeText') === 'true';
        this.reducedMotion = localStorage.getItem('unoReducedMotion') === 'true';
        
        this.applySettings();
    }

    toggleHighContrast() {
        this.highContrast = !this.highContrast;
        localStorage.setItem('unoHighContrast', this.highContrast);
        this.applySettings();
        return this.highContrast;
    }

    toggleLargeText() {
        this.largeText = !this.largeText;
        localStorage.setItem('unoLargeText', this.largeText);
        this.applySettings();
        return this.largeText;
    }

    toggleReducedMotion() {
        this.reducedMotion = !this.reducedMotion;
        localStorage.setItem('unoReducedMotion', this.reducedMotion);
        this.applySettings();
        return this.reducedMotion;
    }

    applySettings() {
        document.body.classList.toggle('high-contrast', this.highContrast);
        document.body.classList.toggle('large-text', this.largeText);
        document.body.classList.toggle('reduced-motion', this.reducedMotion);
    }
}

// إنشاء المديرين المحسنين
const enhancedAnimationManager = new EnhancedAnimationManager();
const enhancedSoundManager = new EnhancedSoundManager();
const themeManager = new ThemeManager();
const accessibilityManager = new AccessibilityManager();

// إضافة CSS للرسوم المتحركة المحسنة
const enhancedAnimationsCSS = `
:root {
    --primary-color: #667eea;
    --secondary-color: #764ba2;
    --background-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    --card-back-color: #2c3e50;
}

@keyframes confetti-fall {
    0% {
        transform: translateY(-100vh) rotate(0deg);
        opacity: 1;
    }
    100% {
        transform: translateY(100vh) rotate(720deg);
        opacity: 0;
    }
}

@keyframes card-pulse {
    0%, 100% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.7);
    }
    50% {
        transform: scale(1.05);
        box-shadow: 0 0 0 10px rgba(255, 255, 255, 0);
    }
}

@keyframes shake {
    0%, 100% { transform: translateX(0); }
    10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
    20%, 40%, 60%, 80% { transform: translateX(5px); }
}

@keyframes glow {
    0%, 100% { box-shadow: 0 0 5px rgba(255, 255, 255, 0.5); }
    50% { box-shadow: 0 0 20px rgba(255, 255, 255, 0.8); }
}

.playable-card {
    cursor: pointer;
    transition: all 0.3s ease;
}

.playable-card:hover {
    transform: translateY(-10px) scale(1.05);
    box-shadow: 0 10px 25px rgba(0,0,0,0.3);
}

.card-flip {
    animation: card-flip 0.6s ease-in-out;
}

@keyframes card-flip {
    0% { transform: rotateY(0deg); }
    50% { transform: rotateY(90deg); }
    100% { transform: rotateY(0deg); }
}

.slide-in {
    animation: slide-in 0.5s ease-out;
}

@keyframes slide-in {
    0% {
        transform: translateX(-100%);
        opacity: 0;
    }
    100% {
        transform: translateX(0);
        opacity: 1;
    }
}

.fade-in {
    animation: fade-in 0.5s ease-in;
}

@keyframes fade-in {
    0% { opacity: 0; }
    100% { opacity: 1; }
}

.bounce-in {
    animation: bounce-in 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

@keyframes bounce-in {
    0% {
        transform: scale(0);
        opacity: 0;
    }
    50% {
        transform: scale(1.1);
    }
    100% {
        transform: scale(1);
        opacity: 1;
    }
}

/* إعدادات إمكانية الوصول */
.high-contrast {
    filter: contrast(150%);
}

.large-text {
    font-size: 1.2em;
}

.reduced-motion * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
}

/* تحسينات الثيمات */
.theme-selector {
    display: flex;
    gap: 1rem;
    margin: 1rem 0;
    flex-wrap: wrap;
}

.theme-option {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 3px solid transparent;
    cursor: pointer;
    transition: all 0.3s ease;
}

.theme-option.active {
    border-color: white;
    transform: scale(1.2);
}

.theme-option:hover {
    transform: scale(1.1);
}

/* تحسينات البطاقات */
.card {
    transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    transform-style: preserve-3d;
}

.card:hover {
    transform: translateY(-5px) rotateX(5deg);
}

.card-back {
    background: var(--card-back-color);
    background-image: 
        radial-gradient(circle at 25% 25%, rgba(255,255,255,0.1) 0%, transparent 50%),
        linear-gradient(45deg, rgba(255,255,255,0.05) 25%, transparent 25%),
        linear-gradient(-45deg, rgba(255,255,255,0.05) 25%, transparent 25%);
    background-size: 20px 20px, 10px 10px, 10px 10px;
}

/* تأثيرات الإشعارات */
.notification {
    animation: notification-slide 0.5s ease-out;
}

@keyframes notification-slide {
    0% {
        transform: translateX(100%);
        opacity: 0;
    }
    100% {
        transform: translateX(0);
        opacity: 1;
    }
}

/* تحسينات الأزرار */
.enhanced-button {
    position: relative;
    overflow: hidden;
    transition: all 0.3s ease;
}

.enhanced-button::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
    transition: left 0.5s;
}

.enhanced-button:hover::before {
    left: 100%;
}

.enhanced-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(0,0,0,0.3);
}

/* تأثيرات الجسيمات */
.particle-effect {
    position: absolute;
    pointer-events: none;
    z-index: 1000;
}

.floating-score {
    position: absolute;
    font-weight: bold;
    font-size: 1.5rem;
    color: #ffd700;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
    animation: float-up 2s ease-out forwards;
    pointer-events: none;
    z-index: 1000;
}

@keyframes float-up {
    0% {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
    100% {
        opacity: 0;
        transform: translateY(-100px) scale(1.5);
    }
}
`;

const enhancedAnimationsStyleSheet = document.createElement('style');
enhancedAnimationsStyleSheet.textContent = enhancedAnimationsCSS;
document.head.appendChild(enhancedAnimationsStyleSheet);

// تحديث مديري الرسوم المتحركة والأصوات الموجودين
if (window.AnimationManager) {
    Object.assign(window.AnimationManager, enhancedAnimationManager);
}
if (window.SoundManager) {
    Object.assign(window.SoundManager, enhancedSoundManager);
}

// إضافة إعدادات محسنة للعبة
function createEnhancedSettingsMenu() {
    const settingsModal = document.createElement('div');
    settingsModal.className = 'settings-modal';
    settingsModal.innerHTML = `
        <div class="modal-content">
            <h2>⚙️ إعدادات اللعبة</h2>
            
            <div class="settings-section">
                <h3>🎨 المظهر</h3>
                <div class="setting-item">
                    <label>اختر الثيم:</label>
                    <div class="theme-selector">
                        ${themeManager.getAvailableThemes().map(theme => `
                            <div class="theme-option ${theme.key === themeManager.getCurrentTheme() ? 'active' : ''}" 
                                 data-theme="${theme.key}" 
                                 title="${theme.name}"
                                 style="background: ${themeManager.themes[theme.key].colors.background}">
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            
            <div class="settings-section">
                <h3>🔊 الصوت</h3>
                <div class="setting-item">
                    <label>
                        <input type="checkbox" ${enhancedSoundManager.enabled ? 'checked' : ''} 
                               onchange="enhancedSoundManager.toggle()">
                        تفعيل الأصوات
                    </label>
                </div>
                <div class="setting-item">
                    <label>مستوى الصوت:</label>
                    <input type="range" min="0" max="1" step="0.1" 
                           value="${enhancedSoundManager.volume}"
                           onchange="enhancedSoundManager.setVolume(this.value)">
                </div>
            </div>
            
            <div class="settings-section">
                <h3>♿ إمكانية الوصول</h3>
                <div class="setting-item">
                    <label>
                        <input type="checkbox" ${accessibilityManager.highContrast ? 'checked' : ''} 
                               onchange="accessibilityManager.toggleHighContrast()">
                        تباين عالي
                    </label>
                </div>
                <div class="setting-item">
                    <label>
                        <input type="checkbox" ${accessibilityManager.largeText ? 'checked' : ''} 
                               onchange="accessibilityManager.toggleLargeText()">
                        نص كبير
                    </label>
                </div>
                <div class="setting-item">
                    <label>
                        <input type="checkbox" ${accessibilityManager.reducedMotion ? 'checked' : ''} 
                               onchange="accessibilityManager.toggleReducedMotion()">
                        تقليل الحركة
                    </label>
                </div>
            </div>
            
            <div class="modal-actions">
                <button onclick="this.closest('.settings-modal').remove()">إغلاق</button>
                <button onclick="resetAllSettings()">إعادة تعيين</button>
            </div>
        </div>
    `;
    
    // إضافة مستمعي الأحداث للثيمات
    settingsModal.querySelectorAll('.theme-option').forEach(option => {
        option.addEventListener('click', () => {
            const themeName = option.dataset.theme;
            themeManager.applyTheme(themeName);
            
            // تحديث الثيم النشط
            settingsModal.querySelectorAll('.theme-option').forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
        });
    });
    
    document.body.appendChild(settingsModal);
}

// دالة إعادة تعيين الإعدادات
function resetAllSettings() {
    if (confirm('هل أنت متأكد من إعادة تعيين جميع الإعدادات؟')) {
        localStorage.removeItem('unoTheme');
        localStorage.removeItem('unoHighContrast');
        localStorage.removeItem('unoLargeText');
        localStorage.removeItem('unoReducedMotion');
        
        location.reload();
    }
}

// تحديث زر الإعدادات في القائمة الرئيسية
document.addEventListener('DOMContentLoaded', function() {
    const settingsBtn = document.querySelector('button[onclick*="settings"]');
    if (settingsBtn) {
        settingsBtn.onclick = createEnhancedSettingsMenu;
    }
});

// إضافة تأثيرات صوتية للأحداث
document.addEventListener('click', function(event) {
    if (event.target.classList.contains('card') && !event.target.classList.contains('card-back')) {
        enhancedSoundManager.playCardSound();
    }
    
    if (event.target.tagName === 'BUTTON') {
        enhancedSoundManager.playTone(440, 0.1);
    }
});

// تصدير المديرين المحسنين
window.UNOGame.EnhancedAnimationManager = EnhancedAnimationManager;
window.UNOGame.EnhancedSoundManager = EnhancedSoundManager;
window.UNOGame.ThemeManager = ThemeManager;
window.UNOGame.AccessibilityManager = AccessibilityManager;

window.enhancedAnimationManager = enhancedAnimationManager;
window.enhancedSoundManager = enhancedSoundManager;
window.themeManager = themeManager;
window.accessibilityManager = accessibilityManager;

console.log('تم تحميل الرسوم المتحركة والأصوات المحسنة بنجاح! 🎨🔊✨');



// ===== نظام الأصوات المتقدم =====
class SoundManager {
    constructor() {
        this.audioContext = null;
        this.sounds = {};
        this.soundEnabled = true;
        this.musicEnabled = true;
        this.soundVolume = 0.7;
        this.musicVolume = 0.3;
        this.backgroundMusic = null;
        this.initializeAudioContext();
        this.createSounds();
    }

    initializeAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
    }

    createSounds() {
        // إنشاء أصوات باستخدام Web Audio API
        this.sounds = {
            cardPlay: this.createTone(440, 0.1, 'sine'),
            cardDraw: this.createTone(330, 0.15, 'triangle'),
            cardShuffle: this.createNoise(0.2),
            unoCall: this.createChord([523, 659, 784], 0.3),
            gameWin: this.createMelody([523, 587, 659, 698, 784], 0.5),
            gameLose: this.createMelody([392, 349, 311, 277], 0.4),
            buttonClick: this.createTone(800, 0.05, 'square'),
            notification: this.createTone(660, 0.2, 'sine'),
            wildCard: this.createChord([440, 554, 659], 0.25),
            skipCard: this.createTone(880, 0.1, 'sawtooth'),
            reverseCard: this.createSweep(440, 880, 0.2),
            drawTwoCard: this.createTone(220, 0.3, 'triangle'),
            playerTurn: this.createTone(523, 0.1, 'sine')
        };
    }

    createTone(frequency, duration, type = 'sine') {
        return () => {
            if (!this.audioContext || !this.soundEnabled) return;
            
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            oscillator.type = type;
            
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(this.soundVolume * 0.3, this.audioContext.currentTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration);
        };
    }

    createChord(frequencies, duration) {
        return () => {
            if (!this.audioContext || !this.soundEnabled) return;
            
            frequencies.forEach((freq, index) => {
                setTimeout(() => {
                    const oscillator = this.audioContext.createOscillator();
                    const gainNode = this.audioContext.createGain();
                    
                    oscillator.connect(gainNode);
                    gainNode.connect(this.audioContext.destination);
                    
                    oscillator.frequency.setValueAtTime(freq, this.audioContext.currentTime);
                    oscillator.type = 'sine';
                    
                    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
                    gainNode.gain.linearRampToValueAtTime(this.soundVolume * 0.2, this.audioContext.currentTime + 0.01);
                    gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
                    
                    oscillator.start(this.audioContext.currentTime);
                    oscillator.stop(this.audioContext.currentTime + duration);
                }, index * 50);
            });
        };
    }

    createMelody(frequencies, totalDuration) {
        return () => {
            if (!this.audioContext || !this.soundEnabled) return;
            
            const noteDuration = totalDuration / frequencies.length;
            frequencies.forEach((freq, index) => {
                setTimeout(() => {
                    const oscillator = this.audioContext.createOscillator();
                    const gainNode = this.audioContext.createGain();
                    
                    oscillator.connect(gainNode);
                    gainNode.connect(this.audioContext.destination);
                    
                    oscillator.frequency.setValueAtTime(freq, this.audioContext.currentTime);
                    oscillator.type = 'sine';
                    
                    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
                    gainNode.gain.linearRampToValueAtTime(this.soundVolume * 0.3, this.audioContext.currentTime + 0.01);
                    gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + noteDuration);
                    
                    oscillator.start(this.audioContext.currentTime);
                    oscillator.stop(this.audioContext.currentTime + noteDuration);
                }, index * noteDuration * 1000);
            });
        };
    }

    createNoise(duration) {
        return () => {
            if (!this.audioContext || !this.soundEnabled) return;
            
            const bufferSize = this.audioContext.sampleRate * duration;
            const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
            const data = buffer.getChannelData(0);
            
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * 0.1;
            }
            
            const source = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();
            const filter = this.audioContext.createBiquadFilter();
            
            source.buffer = buffer;
            source.connect(filter);
            filter.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(1000, this.audioContext.currentTime);
            
            gainNode.gain.setValueAtTime(this.soundVolume * 0.2, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
            
            source.start(this.audioContext.currentTime);
        };
    }

    createSweep(startFreq, endFreq, duration) {
        return () => {
            if (!this.audioContext || !this.soundEnabled) return;
            
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.setValueAtTime(startFreq, this.audioContext.currentTime);
            oscillator.frequency.linearRampToValueAtTime(endFreq, this.audioContext.currentTime + duration);
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(this.soundVolume * 0.3, this.audioContext.currentTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration);
        };
    }

    playSound(soundName) {
        if (this.sounds[soundName] && this.soundEnabled) {
            try {
                this.sounds[soundName]();
            } catch (e) {
                console.warn('Error playing sound:', soundName, e);
            }
        }
    }

    playSoundForCard(card) {
        if (!card) return;
        
        switch (card.type) {
            case CARD_TYPES.WILD:
            case CARD_TYPES.WILD_DRAW_FOUR:
                this.playSound('wildCard');
                break;
            case CARD_TYPES.SKIP:
                this.playSound('skipCard');
                break;
            case CARD_TYPES.REVERSE:
                this.playSound('reverseCard');
                break;
            case CARD_TYPES.DRAW_TWO:
                this.playSound('drawTwoCard');
                break;
            default:
                this.playSound('cardPlay');
        }
    }

    toggleSound() {
        this.soundEnabled = !this.soundEnabled;
        this.saveSettings();
        return this.soundEnabled;
    }

    toggleMusic() {
        this.musicEnabled = !this.musicEnabled;
        if (this.musicEnabled) {
            this.startBackgroundMusic();
        } else {
            this.stopBackgroundMusic();
        }
        this.saveSettings();
        return this.musicEnabled;
    }

    setSoundVolume(volume) {
        this.soundVolume = Math.max(0, Math.min(1, volume));
        this.saveSettings();
    }

    setMusicVolume(volume) {
        this.musicVolume = Math.max(0, Math.min(1, volume));
        if (this.backgroundMusic) {
            this.backgroundMusic.volume = this.musicVolume;
        }
        this.saveSettings();
    }

    startBackgroundMusic() {
        if (!this.musicEnabled) return;
        
        // إنشاء موسيقى خلفية بسيطة باستخدام Web Audio API
        if (this.audioContext && !this.backgroundMusic) {
            this.createBackgroundMusic();
        }
    }

    createBackgroundMusic() {
        // موسيقى خلفية هادئة ومتكررة
        const melody = [523, 587, 659, 587, 523, 440, 494, 523];
        const playMelody = () => {
            if (!this.musicEnabled) return;
            
            melody.forEach((freq, index) => {
                setTimeout(() => {
                    if (!this.musicEnabled) return;
                    
                    const oscillator = this.audioContext.createOscillator();
                    const gainNode = this.audioContext.createGain();
                    
                    oscillator.connect(gainNode);
                    gainNode.connect(this.audioContext.destination);
                    
                    oscillator.frequency.setValueAtTime(freq, this.audioContext.currentTime);
                    oscillator.type = 'sine';
                    
                    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
                    gainNode.gain.linearRampToValueAtTime(this.musicVolume * 0.1, this.audioContext.currentTime + 0.1);
                    gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.8);
                    
                    oscillator.start(this.audioContext.currentTime);
                    oscillator.stop(this.audioContext.currentTime + 0.8);
                }, index * 1000);
            });
            
            // تكرار الموسيقى
            setTimeout(playMelody, melody.length * 1000 + 2000);
        };
        
        playMelody();
        this.backgroundMusic = { volume: this.musicVolume };
    }

    stopBackgroundMusic() {
        this.backgroundMusic = null;
    }

    saveSettings() {
        const settings = {
            soundEnabled: this.soundEnabled,
            musicEnabled: this.musicEnabled,
            soundVolume: this.soundVolume,
            musicVolume: this.musicVolume
        };
        localStorage.setItem('unoSoundSettings', JSON.stringify(settings));
    }

    loadSettings() {
        try {
            const settings = JSON.parse(localStorage.getItem('unoSoundSettings'));
            if (settings) {
                this.soundEnabled = settings.soundEnabled !== false;
                this.musicEnabled = settings.musicEnabled !== false;
                this.soundVolume = settings.soundVolume || 0.7;
                this.musicVolume = settings.musicVolume || 0.3;
            }
        } catch (e) {
            console.warn('Error loading sound settings:', e);
        }
    }
}

// إنشاء مدير الأصوات العام
const soundManager = new SoundManager();


// ===== نظام التلميحات (Tooltips) =====
class TooltipManager {
    constructor() {
        this.activeTooltip = null;
        this.tooltipDelay = 500; // تأخير ظهور التلميح بالميلي ثانية
        this.hideDelay = 100; // تأخير إخفاء التلميح
        this.timeouts = new Map();
        this.initializeTooltips();
    }

    initializeTooltips() {
        // إضافة مستمعي الأحداث للعناصر التي تحتاج تلميحات
        document.addEventListener('mouseover', this.handleMouseOver.bind(this));
        document.addEventListener('mouseout', this.handleMouseOut.bind(this));
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    }

    handleMouseOver(event) {
        const element = event.target;
        
        // التحقق من البطاقات
        if (element.classList.contains('card') && !element.classList.contains('back')) {
            this.showCardTooltip(element, event);
        }
        // التحقق من الأزرار
        else if (element.tagName === 'BUTTON' || element.classList.contains('btn')) {
            this.showButtonTooltip(element, event);
        }
        // التحقق من العناصر التي لها خاصية data-tooltip
        else if (element.hasAttribute('data-tooltip')) {
            this.showSimpleTooltip(element, event);
        }
    }

    handleMouseOut(event) {
        const element = event.target;
        
        if (this.timeouts.has(element)) {
            clearTimeout(this.timeouts.get(element));
            this.timeouts.delete(element);
        }
        
        const hideTimeout = setTimeout(() => {
            this.hideTooltip();
        }, this.hideDelay);
        
        this.timeouts.set(element, hideTimeout);
    }

    handleMouseMove(event) {
        if (this.activeTooltip) {
            this.positionTooltip(this.activeTooltip, event);
        }
    }

    showCardTooltip(cardElement, event) {
        const showTimeout = setTimeout(() => {
            const cardData = this.getCardData(cardElement);
            if (cardData) {
                const tooltip = this.createCardTooltip(cardData);
                this.showTooltip(tooltip, event);
            }
        }, this.tooltipDelay);
        
        this.timeouts.set(cardElement, showTimeout);
    }

    showButtonTooltip(buttonElement, event) {
        const showTimeout = setTimeout(() => {
            const tooltipText = this.getButtonTooltipText(buttonElement);
            if (tooltipText) {
                const tooltip = this.createSimpleTooltip(tooltipText);
                tooltip.classList.add('button-tooltip');
                this.showTooltip(tooltip, event);
            }
        }, this.tooltipDelay);
        
        this.timeouts.set(buttonElement, showTimeout);
    }

    showSimpleTooltip(element, event) {
        const showTimeout = setTimeout(() => {
            const tooltipText = element.getAttribute('data-tooltip');
            if (tooltipText) {
                const tooltip = this.createSimpleTooltip(tooltipText);
                this.showTooltip(tooltip, event);
            }
        }, this.tooltipDelay);
        
        this.timeouts.set(element, showTimeout);
    }

    getCardData(cardElement) {
        const cardId = cardElement.dataset.cardId;
        const cardType = cardElement.dataset.type;
        const cardColor = cardElement.dataset.color;
        const cardValue = cardElement.dataset.value;
        
        return {
            id: cardId,
            type: cardType,
            color: cardColor,
            value: cardValue,
            element: cardElement
        };
    }

    createCardTooltip(cardData) {
        const tooltip = document.createElement('div');
        tooltip.className = `tooltip card-tooltip ${cardData.color}-card animated`;
        
        const title = document.createElement('div');
        title.className = 'tooltip-title';
        title.textContent = this.getCardTitle(cardData);
        
        const description = document.createElement('div');
        description.className = 'tooltip-description';
        description.textContent = this.getCardDescription(cardData);
        
        const points = document.createElement('div');
        points.className = 'tooltip-points';
        points.textContent = `النقاط: ${this.getCardPoints(cardData)}`;
        
        tooltip.appendChild(title);
        tooltip.appendChild(description);
        tooltip.appendChild(points);
        
        return tooltip;
    }

    createSimpleTooltip(text) {
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip animated';
        tooltip.textContent = text;
        return tooltip;
    }

    getCardTitle(cardData) {
        const { type, color, value } = cardData;
        
        const colorNames = {
            red: 'أحمر',
            blue: 'أزرق',
            yellow: 'أصفر',
            green: 'أخضر',
            wild: 'بري'
        };
        
        const typeNames = {
            number: 'رقم',
            skip: 'تخطي',
            reverse: 'عكس',
            draw_two: 'سحب اثنين',
            wild: 'بري',
            wild_draw_four: 'بري +4'
        };
        
        if (type === 'number') {
            return `${colorNames[color]} ${value}`;
        } else {
            return `${typeNames[type]} ${color !== 'wild' ? colorNames[color] : ''}`.trim();
        }
    }

    getCardDescription(cardData) {
        const { type } = cardData;
        
        const descriptions = {
            number: 'بطاقة رقمية عادية. يمكن لعبها على نفس اللون أو الرقم.',
            skip: 'تخطي دور اللاعب التالي.',
            reverse: 'عكس اتجاه اللعب.',
            draw_two: 'اللاعب التالي يسحب بطاقتين ويفقد دوره.',
            wild: 'يمكن لعبها في أي وقت. اختر اللون التالي.',
            wild_draw_four: 'اللاعب التالي يسحب 4 بطاقات ويفقد دوره. اختر اللون التالي.'
        };
        
        return descriptions[type] || 'بطاقة خاصة';
    }

    getCardPoints(cardData) {
        const { type, value } = cardData;
        
        if (type === 'number') {
            return value;
        }
        
        const points = {
            skip: 20,
            reverse: 20,
            draw_two: 20,
            wild: 50,
            wild_draw_four: 50
        };
        
        return points[type] || 0;
    }

    getButtonTooltipText(buttonElement) {
        const buttonId = buttonElement.id;
        const buttonClass = buttonElement.className;
        const buttonText = buttonElement.textContent.trim();
        
        // تلميحات مخصصة للأزرار المختلفة
        const tooltips = {
            'drawBtn': 'سحب بطاقة من المجموعة',
            'passBtn': 'تمرير الدور للاعب التالي',
            'unoBtn': 'اضغط عندما يتبقى لديك بطاقة واحدة!',
            'soundToggle': 'تشغيل/إيقاف الأصوات',
            'musicToggle': 'تشغيل/إيقاف الموسيقى الخلفية',
            'settingsBtn': 'فتح إعدادات اللعبة',
            'singlePlayerBtn': 'لعب ضد الذكاء الاصطناعي',
            'multiPlayerBtn': 'لعب مع أصدقائك عبر الإنترنت'
        };
        
        if (tooltips[buttonId]) {
            return tooltips[buttonId];
        }
        
        // تلميحات عامة حسب النص أو الفئة
        if (buttonText.includes('بدء')) {
            return 'بدء لعبة جديدة';
        } else if (buttonText.includes('إعدادات')) {
            return 'تخصيص إعدادات اللعبة';
        } else if (buttonText.includes('العودة')) {
            return 'العودة للقائمة السابقة';
        }
        
        return null;
    }

    showTooltip(tooltip, event) {
        this.hideTooltip(); // إخفاء أي تلميح سابق
        
        document.body.appendChild(tooltip);
        this.activeTooltip = tooltip;
        
        // تحديد موضع التلميح
        this.positionTooltip(tooltip, event);
        
        // إظهار التلميح
        setTimeout(() => {
            tooltip.classList.add('show');
        }, 10);
    }

    positionTooltip(tooltip, event) {
        const rect = tooltip.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        let x = event.clientX;
        let y = event.clientY - rect.height - 10;
        
        // التأكد من أن التلميح لا يخرج من الشاشة
        if (x + rect.width > viewportWidth) {
            x = viewportWidth - rect.width - 10;
        }
        
        if (x < 10) {
            x = 10;
        }
        
        if (y < 10) {
            y = event.clientY + 10;
            tooltip.classList.add('bottom');
        } else {
            tooltip.classList.remove('bottom');
        }
        
        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
    }

    hideTooltip() {
        if (this.activeTooltip) {
            this.activeTooltip.classList.remove('show');
            setTimeout(() => {
                if (this.activeTooltip && this.activeTooltip.parentNode) {
                    this.activeTooltip.parentNode.removeChild(this.activeTooltip);
                }
                this.activeTooltip = null;
            }, 300);
        }
    }

    // إضافة تلميح مخصص لعنصر معين
    addTooltip(element, text, options = {}) {
        element.setAttribute('data-tooltip', text);
        
        if (options.delay) {
            element.setAttribute('data-tooltip-delay', options.delay);
        }
        
        if (options.position) {
            element.setAttribute('data-tooltip-position', options.position);
        }
    }

    // إزالة تلميح من عنصر
    removeTooltip(element) {
        element.removeAttribute('data-tooltip');
        element.removeAttribute('data-tooltip-delay');
        element.removeAttribute('data-tooltip-position');
    }
}

// إنشاء مدير التلميحات العام
const tooltipManager = new TooltipManager();


// ===== تكامل الميزات الجديدة مع اللعبة =====

// تحديث GameManager لدعم الميزات الجديدة
