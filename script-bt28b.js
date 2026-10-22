const DEFAULT_DURATION_SECONDS = 30;
const MIN_DURATION_SECONDS = 5;
const MAX_DURATION_SECONDS = 300;
const STARTING_LIVES = 3;
const TARGET_SIZE = 48;
const TARGET_GAP = 10;
const MAX_TARGETS = 12;
const SPAWN_INTERVAL_MS = 1000;
const TARGET_LIFETIME_MS = 4000;
const BONUS_LIFETIME_MS = 1500;
const MISS_LOCK_MS = 500;
const HIGH_SCORE_KEY = "reaction-reflex-v2-high-score";
const HIGH_SCORE_MASK = 0x5a3c;
const ARENA_COLORS = [
  ["#e6f4ff", "#d7e9ff"],
  ["#fff0e4", "#ffe2cd"],
  ["#e4f8ef", "#d0f0e3"],
  ["#f8eaff", "#eadcff"],
  ["#fff1f4", "#ffe0e8"],
  ["#e5f4f2", "#d3ece8"],
];

const arena = document.querySelector("#arena");
const scoreDisplay = document.querySelector("#score");
const livesDisplay = document.querySelector("#lives");
const levelDisplay = document.querySelector("#level");
const timerDisplay = document.querySelector("#timer");
const timerBar = document.querySelector("#timer-bar");
const highScoreDisplay = document.querySelector("#high-score");
const startButton = document.querySelector("#start-button");
const endButton = document.querySelector("#end-button");
const durationInput = document.querySelector("#duration-input");
const backgroundButton = document.querySelector("#background-button");
const playerButton = document.querySelector("#player-button");
const playerInfo = document.querySelector("#player-info");
const arenaMessage = document.querySelector("#arena-message");
const penaltyMessage = document.querySelector("#penalty-message");
const gameStatus = document.querySelector("#game-status");

const targets = new Map();
let score = 0;
let lives = STARTING_LIVES;
let level = 1;
let highScore = 0;
let deadline = 0;
let totalDurationMs = DEFAULT_DURATION_SECONDS * 1000;
let gameIsRunning = false;
let spawnTimeoutId = null;
let clockIntervalId = null;
let lockTimeoutId = null;
let penaltyMessageTimeoutId = null;
let inputLockedUntil = 0;

function loadHighScore() {
  try {
    const storedValue = window.localStorage.getItem(HIGH_SCORE_KEY);
    if (storedValue === null) {
      return 0;
    }

    const decodedValue = Number.parseInt(window.atob(storedValue), 10);
    const decodedScore = decodedValue ^ HIGH_SCORE_MASK;
    if (!Number.isSafeInteger(decodedScore) || decodedScore < 0) {
      throw new Error("Dữ liệu kỷ lục không hợp lệ.");
    }
    return decodedScore;
  } catch (error) {
    console.error("Không thể đọc kỷ lục từ localStorage.", error);
    gameStatus.textContent = "Không đọc được kỷ lục đã lưu trên trình duyệt.";
    return 0;
  }
}

function saveHighScore() {
  try {
    window.localStorage.setItem(
      HIGH_SCORE_KEY,
      window.btoa(String(highScore ^ HIGH_SCORE_MASK)),
    );
  } catch (error) {
    console.error("Không thể lưu kỷ lục vào localStorage.", error);
    gameStatus.textContent = "Không thể lưu kỷ lục trên trình duyệt này.";
  }
}

function updateScoreDisplay() {
  scoreDisplay.textContent = String(score);
  const nextLevel = Math.floor(score / 10) + 1;
  if (nextLevel !== level) {
    level = nextLevel;
    levelDisplay.textContent = String(level);
    gameStatus.textContent = `Lên cấp ${level}! Mục tiêu xuất hiện nhanh hơn.`;
    scheduleNextSpawn();
  }
}

function updateLivesDisplay() {
  livesDisplay.textContent = `${"♥ ".repeat(lives)}${"♡ ".repeat(
    STARTING_LIVES - lives,
  )}`.trim();
  livesDisplay.setAttribute("aria-label", `${lives} mạng`);
}

function currentDifficultyMultiplier() {
  return 0.85 ** (level - 1);
}

function getTargetLifetime(type) {
  return type === "gold"
    ? BONUS_LIFETIME_MS
    : Math.max(1000, TARGET_LIFETIME_MS * currentDifficultyMultiplier());
}

function getSpawnInterval() {
  return Math.max(350, SPAWN_INTERVAL_MS * currentDifficultyMultiplier());
}

function chooseTargetType() {
  const roll = Math.random();
  if (roll < 0.2) {
    return "red";
  }
  if (roll < 0.34) {
    return "gold";
  }
  return "green";
}

function findUnoccupiedPosition() {
  const maxLeft = arena.clientWidth - TARGET_SIZE;
  const maxTop = arena.clientHeight - TARGET_SIZE;
  const existingTargets = [...targets.values()];

  function isUnoccupied(left, top) {
    return existingTargets.every((existing) => {
      const dx = left - existing.left;
      const dy = top - existing.top;
      const minDistance = TARGET_SIZE + TARGET_GAP;
      return dx * dx + dy * dy >= minDistance * minDistance;
    });
  }

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const left = Math.floor(Math.random() * (maxLeft + 1));
    const top = Math.floor(Math.random() * (maxTop + 1));
    if (isUnoccupied(left, top)) {
      return { left, top };
    }
  }

  const step = TARGET_SIZE + TARGET_GAP;
  for (let top = 0; top <= maxTop; top += step) {
    for (let left = 0; left <= maxLeft; left += step) {
      if (isUnoccupied(left, top)) {
        return { left, top };
      }
    }
  }
  return null;
}

function removeTarget(targetId) {
  const target = targets.get(targetId);
  if (!target) {
    return;
  }
  window.clearTimeout(target.timeoutId);
  target.element.remove();
  targets.delete(targetId);
}

function expireTarget(targetId) {
  const target = targets.get(targetId);
  if (!target) {
    return;
  }
  const missedBonus = target.type === "gold" && gameIsRunning;
  removeTarget(targetId);
  if (missedBonus) {
    loseLife("Bỏ lỡ mục tiêu thưởng! Bạn mất 1 mạng.");
  }
}

function animateTargetOut(targetId) {
  const target = targets.get(targetId);
  if (!target) {
    return;
  }
  window.clearTimeout(target.timeoutId);
  target.element.classList.add("target--hit");
  target.timeoutId = window.setTimeout(() => removeTarget(targetId), 160);
}

function spawnTarget() {
  if (!gameIsRunning || targets.size >= MAX_TARGETS) {
    return;
  }
  const position = findUnoccupiedPosition();
  if (!position) {
    return;
  }

  const type = chooseTargetType();
  const lifetime = getTargetLifetime(type);
  const element = document.createElement("button");
  const labels = {
    green: "Mục tiêu thường, cộng 1 điểm",
    red: "Mục tiêu bẫy, mất 1 mạng",
    gold: "Mục tiêu thưởng, cộng 3 điểm và 2 giây",
  };

  element.type = "button";
  element.className = `target target--${type}`;
  element.textContent = type === "green" ? "+" : type === "red" ? "−" : "★";
  element.setAttribute("aria-label", labels[type]);
  element.style.left = `${position.left}px`;
  element.style.top = `${position.top}px`;
  element.style.setProperty("--target-lifetime", `${lifetime}ms`);
  arena.append(element);

  const targetId = `${Date.now()}-${Math.random()}`;
  const timeoutId = window.setTimeout(() => expireTarget(targetId), lifetime);
  targets.set(targetId, {
    element,
    left: position.left,
    top: position.top,
    type,
    timeoutId,
  });
  element.dataset.targetId = targetId;
}

function scheduleNextSpawn() {
  window.clearTimeout(spawnTimeoutId);
  if (!gameIsRunning) {
    spawnTimeoutId = null;
    return;
  }
  spawnTimeoutId = window.setTimeout(() => {
    spawnTarget();
    scheduleNextSpawn();
  }, getSpawnInterval());
}

function showMissPenalty() {
  inputLockedUntil = Date.now() + MISS_LOCK_MS;
  window.clearTimeout(lockTimeoutId);
  window.clearTimeout(penaltyMessageTimeoutId);
  arena.classList.add("arena--locked");
  penaltyMessage.textContent = "Click trượt! Tạm khóa thao tác 0,5 giây.";
  penaltyMessage.classList.add("penalty-message--visible");
  gameStatus.textContent = "Click vào vùng trống: thao tác bị khóa trong 0,5 giây.";
  lockTimeoutId = window.setTimeout(() => {
    inputLockedUntil = 0;
    arena.classList.remove("arena--locked");
  }, MISS_LOCK_MS);
  penaltyMessageTimeoutId = window.setTimeout(() => {
    penaltyMessage.classList.remove("penalty-message--visible");
  }, 1100);
}

function clearTargets() {
  for (const target of targets.values()) {
    window.clearTimeout(target.timeoutId);
    target.element.remove();
  }
  targets.clear();
}

function clearGameTimers() {
  window.clearTimeout(spawnTimeoutId);
  window.clearInterval(clockIntervalId);
  window.clearTimeout(lockTimeoutId);
  window.clearTimeout(penaltyMessageTimeoutId);
  spawnTimeoutId = null;
  clockIntervalId = null;
  lockTimeoutId = null;
  penaltyMessageTimeoutId = null;
  inputLockedUntil = 0;
  arena.classList.remove("arena--locked");
  penaltyMessage.classList.remove("penalty-message--visible");
}

function finishGame(reason) {
  if (!gameIsRunning) {
    return;
  }
  gameIsRunning = false;
  clearGameTimers();
  clearTargets();
  arenaMessage.textContent = reason;
  arenaMessage.hidden = false;
  startButton.disabled = false;
  startButton.textContent = "Chơi lại";
  endButton.disabled = true;
  durationInput.disabled = false;

  let recordMessage = "";
  if (score > highScore) {
    highScore = score;
    highScoreDisplay.textContent = String(highScore);
    saveHighScore();
    recordMessage = " Kỷ lục mới!";
  }
  gameStatus.textContent = `Kết thúc! Bạn đạt ${score} điểm.${recordMessage}`;
}

function loseLife(message) {
  if (!gameIsRunning) {
    return;
  }
  lives = Math.max(0, lives - 1);
  updateLivesDisplay();
  gameStatus.textContent = message;
  if (lives === 0) {
    finishGame("Hết mạng! Thử lại nhé.");
  }
}

function updateClock() {
  if (!gameIsRunning) {
    return;
  }
  const millisecondsRemaining = Math.max(0, deadline - Date.now());
  const secondsRemaining = Math.ceil(millisecondsRemaining / 1000);
  timerDisplay.textContent = `${secondsRemaining} giây`;
  timerBar.style.width = `${Math.min(
    100,
    (millisecondsRemaining / totalDurationMs) * 100,
  )}%`;
  if (millisecondsRemaining === 0) {
    finishGame("Hết giờ! Xem bạn đạt được bao nhiêu điểm.");
  }
}

function getSelectedDuration() {
  const duration = Number(durationInput.value);
  if (
    !Number.isInteger(duration) ||
    duration < MIN_DURATION_SECONDS ||
    duration > MAX_DURATION_SECONDS
  ) {
    durationInput.setCustomValidity(
      `Nhập thời lượng từ ${MIN_DURATION_SECONDS} đến ${MAX_DURATION_SECONDS} giây.`,
    );
    durationInput.reportValidity();
    durationInput.setCustomValidity("");
    return null;
  }
  return duration;
}

function startGame() {
  if (gameIsRunning) {
    return;
  }
  const selectedDuration = getSelectedDuration();
  if (selectedDuration === null) {
    return;
  }

  clearGameTimers();
  clearTargets();
  score = 0;
  lives = STARTING_LIVES;
  level = 1;
  totalDurationMs = selectedDuration * 1000;
  deadline = Date.now() + totalDurationMs;
  gameIsRunning = true;

  scoreDisplay.textContent = "0";
  levelDisplay.textContent = "1";
  timerDisplay.textContent = `${selectedDuration} giây`;
  timerBar.style.width = "100%";
  updateLivesDisplay();
  arenaMessage.hidden = true;
  startButton.disabled = true;
  startButton.textContent = "Đang chơi...";
  endButton.disabled = false;
  durationInput.disabled = true;
  gameStatus.textContent = "Bắt mục tiêu xanh, tránh bẫy đỏ!";
  spawnTarget();
  scheduleNextSpawn();
  clockIntervalId = window.setInterval(updateClock, 100);
}

function handleArenaClick(event) {
  if (!gameIsRunning || Date.now() < inputLockedUntil) {
    return;
  }
  if (event.detail > 1) {
    showMissPenalty();
    return;
  }

  const targetElement = event.target.closest(".target");
  if (!targetElement || !arena.contains(targetElement)) {
    showMissPenalty();
    return;
  }

  const targetId = targetElement.dataset.targetId;
  const target = targets.get(targetId);
  if (!target) {
    return;
  }
  animateTargetOut(targetId);

  if (target.type === "green") {
    score += 1;
    gameStatus.textContent = "Chuẩn xác! +1 điểm.";
  } else if (target.type === "red") {
    loseLife("Trúng bẫy! Bạn mất 1 mạng.");
  } else {
    score += 3;
    deadline += 2 * 1000;
    totalDurationMs += 2 * 1000;
    gameStatus.textContent = "Thưởng vàng! +3 điểm và +2 giây.";
  }
  updateScoreDisplay();
  updateClock();
}

function changeArenaColor() {
  const current = getComputedStyle(arena).getPropertyValue("--arena-color-a").trim();
  const choices = ARENA_COLORS.filter(([color]) => color !== current);
  const [colorA, colorB] = choices[Math.floor(Math.random() * choices.length)];
  arena.style.setProperty("--arena-color-a", colorA);
  arena.style.setProperty("--arena-color-b", colorB);
}

function togglePlayerInfo() {
  const isHidden = playerInfo.hidden;
  playerInfo.textContent = `Duong Nhat Quang · MSSV: 241A010158`;
  playerInfo.hidden = !isHidden;
  playerButton.setAttribute("aria-expanded", String(isHidden));
}

highScore = loadHighScore();
highScoreDisplay.textContent = String(highScore);
updateLivesDisplay();

arena.addEventListener("click", handleArenaClick);
startButton.addEventListener("click", startGame);
endButton.addEventListener("click", () => finishGame("Đã kết thúc trò chơi."));
backgroundButton.addEventListener("click", changeArenaColor);
playerButton.addEventListener("click", togglePlayerInfo);
