const GAME_DURATION_SECONDS = 30;
const TARGET_SIZE = 38;

const arena = document.querySelector("#arena");
const target = document.querySelector("#target");
const scoreDisplay = document.querySelector("#score");
const timerDisplay = document.querySelector("#timer");
const startButton = document.querySelector("#start-button");
const arenaMessage = document.querySelector("#arena-message");
const gameStatus = document.querySelector("#game-status");

let score = 0;
let timeRemaining = GAME_DURATION_SECONDS;
let countdownId = null;
let gameIsRunning = false;

function moveTarget() {
  const maxLeft = arena.clientWidth - TARGET_SIZE;
  const maxTop = arena.clientHeight - TARGET_SIZE;
  const left = Math.floor(Math.random() * (maxLeft + 1));
  const top = Math.floor(Math.random() * (maxTop + 1));

  target.style.left = `${left}px`;
  target.style.top = `${top}px`;
}

function finishGame() {
  gameIsRunning = false;
  window.clearInterval(countdownId);
  countdownId = null;
  target.style.display = "none";
  arenaMessage.textContent = "Hết giờ!";
  arenaMessage.hidden = false;
  startButton.disabled = false;
  startButton.textContent = "Chơi lại";
  gameStatus.textContent = `Kết thúc! Bạn đạt được ${score} điểm.`;
}

function startGame() {
  if (gameIsRunning) {
    return;
  }

  score = 0;
  timeRemaining = GAME_DURATION_SECONDS;
  gameIsRunning = true;

  scoreDisplay.textContent = String(score);
  timerDisplay.textContent = `${timeRemaining} giây`;
  gameStatus.textContent = "Bắt đầu! Click trúng mục tiêu để ghi điểm.";
  arenaMessage.hidden = true;
  target.style.display = "block";
  startButton.disabled = true;
  startButton.textContent = "Đang chơi...";

  moveTarget();
  countdownId = window.setInterval(() => {
    timeRemaining -= 1;
    timerDisplay.textContent = `${timeRemaining} giây`;

    if (timeRemaining <= 0) {
      finishGame();
    } else {
      moveTarget();
    }
  }, 1000);
}

arena.addEventListener("click", (event) => {
  if (!gameIsRunning || event.target !== target) {
    return;
  }

  score += 1;
  scoreDisplay.textContent = String(score);
  moveTarget();
});

startButton.addEventListener("click", startGame);
