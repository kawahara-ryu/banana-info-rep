// === Audio ===
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playTone(f,t,d,v=0.1){if(audioCtx.state==='suspended')audioCtx.resume();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=t;o.frequency.value=f;g.gain.value=v;o.connect(g);g.connect(audioCtx.destination);o.start();g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+d);o.stop(audioCtx.currentTime+d);}

// スタンプ音（ガシャン！）
function playCorrect(){
    // 重い金属音のような打撃音
    playTone(150, 'square', 0.1, 0.4);
    setTimeout(()=>playTone(100, 'sawtooth', 0.2, 0.3), 30);
    setTimeout(()=>playTone(600, 'triangle', 0.1, 0.1), 50); // スキャン完了音も混ぜる
}

// エラー音（ブブッ）
function playWrong(){
    playTone(200,'square',0.1,0.3); setTimeout(()=>playTone(200,'square',0.2,0.3),150);
}
function playClick(){playTone(1200,'sine',0.05,0.1);} // レーザーっぽい音
function playHeartbeat(){playTone(400,'square',0.1,0.05); setTimeout(()=>playTone(400,'square',0.1,0.05),200);} // 警告音
function playMagic(){playTone(2000,'sine',0.1,0.05); setTimeout(()=>playTone(2500,'sine',0.2,0.05),100);} // スキャン音
function playGameOver(){playTone(100,'sawtooth',0.5,0.2);setTimeout(()=>playTone(80,'sawtooth',0.5,0.2),300);setTimeout(()=>playTone(60,'sawtooth',1.0,0.3),600);}
function playClear(){[523,587,659,698,784,880,987,1047].forEach((f,i)=>setTimeout(()=>playTone(f,'square',0.1),i*100));}

// === 視覚ヒントの更新 ===
function setScannerState(state) { // 'scanning', 'complete', 'error'
    const box = document.getElementById('visual-hint-box');
    const text = document.getElementById('scanner-text');
    
    box.classList.remove('scan-complete', 'scan-error');
    
    if(state === 'scanning') {
        text.textContent = "ANALYZING DATA...";
    } else if(state === 'complete') {
        box.classList.add('scan-complete');
        text.textContent = "DATA VERIFIED";
    } else if(state === 'error') {
        box.classList.add('scan-error');
        text.textContent = "FAKE DETECTED";
    }
}

// === State ===
let currentStage = 0, totalScore = 0, mistakes = [], timerInterval = null, timeLeft = 0, isProcessing = false, qIndex = 0;
let hp = 3;
let hintUsed = false;

const screens = { 
    title: document.getElementById('screen-title'), 
    game: document.getElementById('screen-game'), 
    clear: document.getElementById('screen-clear'),
    gameover: document.getElementById('screen-gameover')
};

function startGame() { 
    playClick(); 
    currentStage=0; totalScore=0; mistakes=[]; hp=3; 
    updateHP();
    screens.title.classList.remove('active'); 
    screens.gameover.classList.remove('active'); 
    screens.game.classList.add('active'); 
    loadStage(0); 
}

function updateHP() {
    const hpBar = document.getElementById('hp-bar');
    let icons = "";
    for(let i=0; i<3; i++) { icons += (i < hp) ? "🍌" : "🦍"; }
    hpBar.textContent = icons;
}

function takeDamage(damageText, isTimeout = false) {
    hp--;
    updateHP();
    playWrong();
    
    const container = document.getElementById('game-container');
    container.classList.remove('shake-screen');
    void container.offsetWidth; // reflow
    container.classList.add('shake-screen');

    if (hp <= 0) {
        setTimeout(() => { showGameOver(damageText); }, 1000); 
        return true; 
    }
    return false; 
}

function showGameOver(reason) {
    clearInterval(timerInterval);
    playGameOver();
    screens.game.classList.remove('active');
    document.getElementById('feedback-overlay').classList.add('hidden');
    document.getElementById('gameover-reason').textContent = reason;
    screens.gameover.classList.add('active');
}

function loadStage(n) {
    currentStage = n; isProcessing = false; qIndex = 0;
    clearInterval(timerInterval);
    const stages = [gameData.stage1, gameData.stage2, gameData.stage3];
    if (n >= stages.length) { showClear(); return; }
    
    const s = stages[n];
    document.getElementById('stage-title').textContent = s.title;
    document.getElementById('instruction-box').textContent = s.instruction;
    s._shuffled = [...s.questions].sort(() => Math.random() - 0.5);
    
    if (s.timePerQ > 0) {
        document.getElementById('timer').textContent = `--`;
    } else {
        document.getElementById('timer').textContent = `∞`;
    }
    showQuestion();
}

function showQuestion() {
    const stages = [gameData.stage1, gameData.stage2, gameData.stage3];
    const s = stages[currentStage];
    if (qIndex >= s._shuffled.length) {
        clearInterval(timerInterval);
        showFeedback(true, `【 バッチ処理完了 】\n${s.title} の仕分けが完了した！`, () => loadStage(currentStage + 1));
        return;
    }
    const q = s._shuffled[qIndex];
    document.getElementById('counter').textContent = `DATA ${qIndex + 1} / ${s._shuffled.length}`;
    
    document.getElementById('question-text').innerHTML = q.question;
    setScannerState('scanning');

    // ヒントボタンのリセット
    hintUsed = false;
    const hBtn = document.getElementById('hint-btn');
    hBtn.disabled = false;
    hBtn.classList.remove('used');
    hBtn.textContent = "🔍 ファクトチェック (Time -5s)";

    const optBox = document.getElementById('options');
    optBox.innerHTML = '';
    const shuffledOpts = [...q.options].sort(() => Math.random() - 0.5);
    shuffledOpts.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'quiz-opt'; btn.textContent = opt;
        btn.onclick = () => answerQuestion(opt, q, btn);
        optBox.appendChild(btn);
    });

    isProcessing = false;
    if (s.timePerQ > 0) {
        startTimer(s.timePerQ, () => {
            isProcessing = true; totalScore -= 5;
            mistakes.push({ stage: stages[currentStage].title, question: q.question, answer: q.answer, explanation: q.explanation });
            const isDead = takeDamage("処理遅延によりラインが停止した！");
            if (!isDead) {
                showFeedback(false, `【 タイムアウト 】\nエラー！HP-1\n\n【解析結果】\n${q.explanation}`, () => { qIndex++; showQuestion(); });
            }
        });
    }
}

// お助け機能
function useHint() {
    if(hintUsed || isProcessing) return;
    hintUsed = true;
    playMagic();
    const hBtn = document.getElementById('hint-btn');
    hBtn.disabled = true;
    hBtn.classList.add('used');
    hBtn.textContent = "🔍 検証済";
    
    const stages = [gameData.stage1, gameData.stage2, gameData.stage3];
    if (stages[currentStage].timePerQ > 0) {
        timeLeft -= 5;
        if(timeLeft < 0) timeLeft = 0;
        updateTimer();
    }
    
    const q = stages[currentStage]._shuffled[qIndex];
    const btns = Array.from(document.querySelectorAll('.quiz-opt'));
    const wrongBtns = btns.filter(b => b.textContent !== q.answer);
    
    wrongBtns.sort(() => Math.random() - 0.5);
    if(wrongBtns.length >= 1) wrongBtns[0].classList.add('hidden-opt');
    if(wrongBtns.length >= 2) wrongBtns[1].classList.add('hidden-opt');
}

// スタンプエフェクト
function triggerStamp(isCorrect) {
    const el = document.getElementById('stamp-effect');
    const icon = document.getElementById('stamp-icon');
    
    el.classList.remove('hidden');
    el.classList.remove('stamp-anim');
    icon.classList.remove('reject');
    
    if(isCorrect) {
        icon.textContent = "承認";
        setScannerState('complete');
    } else {
        icon.textContent = "破棄";
        icon.classList.add('reject');
        setScannerState('error');
    }

    void el.offsetWidth; // reflow
    el.classList.add('stamp-anim');
    
    setTimeout(() => { el.classList.add('hidden'); el.classList.remove('stamp-anim'); }, 800);
}

function answerQuestion(selected, q, btn) {
    if (isProcessing) return; isProcessing = true;
    clearInterval(timerInterval);
    const stages = [gameData.stage1, gameData.stage2, gameData.stage3];
    
    if (selected === q.answer) {
        playCorrect(); 
        triggerStamp(true); // 承認スタンプ
        btn.classList.add('correct'); totalScore += 15;
        showFeedback(true, `【 承認 】\n正しい情報だ！\n\n【解析結果】\n${q.explanation}`, () => { qIndex++; showQuestion(); });
    } else {
        triggerStamp(false); // 破棄スタンプ
        btn.classList.add('wrong'); totalScore -= 5;
        document.querySelectorAll('.quiz-opt').forEach(b => { if (b.textContent === q.answer) b.classList.add('correct'); });
        mistakes.push({ stage: stages[currentStage].title, question: q.question, answer: q.answer, explanation: q.explanation });
        
        const isDead = takeDamage(q.damage);
        if (!isDead) {
            showFeedback(false, `【 不良品！HP-1 】\n${q.damage}\n\n【解析結果】\n${q.explanation}`, () => { qIndex++; showQuestion(); });
        }
    }
}

function showClear() {
    playClear(); 
    screens.game.classList.remove('active'); screens.clear.classList.add('active');
    
    // 称号判定
    let rank = "";
    if (hp === 3 && mistakes.length === 0) rank = "👑 伝説のファクトチェッカー";
    else if (hp === 3) rank = "🍌 エリート仕分け人";
    else if (hp === 2) rank = "📦 普通の工場スタッフ";
    else if (hp === 1) rank = "💦 クビ寸前のバイト";
    else rank = "🗑️ 騙されやすいゴリラ";
    
    document.getElementById('rank-display').textContent = rank;
    document.getElementById('score-display').textContent = `正確性スコア: ${totalScore} Pt`;
    document.getElementById('password-text').textContent = gameData.password;
    
    const area = document.getElementById('review-area');
    if (!mistakes.length) { area.innerHTML = '<p class="review-perfect">一度のミスもない完璧な仕分けだ！フェイクニュースはすべて排除された！</p>'; return; }
    area.innerHTML = '';
    mistakes.forEach(m => { const c=document.createElement('div'); c.className='review-card'; c.innerHTML=`<div class="review-stage">${m.stage}</div><div class="review-q">Q: ${m.question}</div><div class="review-a">正答: ${m.answer}</div><div class="review-exp">${m.explanation}</div>`; area.appendChild(c); });
}

function startTimer(sec, cb) { 
    timeLeft=sec; updateTimer(); clearInterval(timerInterval); 
    timerInterval=setInterval(()=>{
        timeLeft--;
        updateTimer();
        if(timeLeft <= 5 && timeLeft > 0) { playHeartbeat(); }
        if(timeLeft<=0){ clearInterval(timerInterval); if(cb)cb(); }
    },1000); 
}
function updateTimer() { const el=document.getElementById('timer'); el.textContent=`${timeLeft}`; el.className='timer-box '+(timeLeft<=5?'timer-danger':''); }
function showFeedback(ok, text, cb) { 
    const ov=document.getElementById('feedback-overlay'); 
    document.getElementById('feedback-title').textContent=ok?'◎ 検証完了':'✖ 検証失敗'; 
    document.getElementById('feedback-title').style.color=ok?'var(--success-color)':'var(--danger-color)'; 
    document.getElementById('feedback-text').innerHTML = text.replace(/\n/g, '<br>'); 
    document.getElementById('next-btn').textContent = ok ? '次のデータへ ▶' : '破棄して進む ▶';
    document.getElementById('next-btn').style.borderColor = ok ? 'var(--success-color)' : 'var(--danger-color)';
    document.getElementById('next-btn').style.color = ok ? 'var(--success-color)' : 'var(--danger-color)';
    ov.classList.remove('hidden'); ov._cb=cb; 
}
function closeFeedback() { playClick(); document.getElementById('feedback-overlay').classList.add('hidden'); const ov=document.getElementById('feedback-overlay'); if(ov._cb)ov._cb(); }
