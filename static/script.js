// Tab switching
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
  });
});

// File upload
const uploadZone = document.getElementById("uploadZone");
const fileInput  = document.getElementById("resumeFile");
const fileChosen = document.getElementById("fileChosen");

uploadZone.addEventListener("click", () => fileInput.click());
uploadZone.addEventListener("dragover", e => { e.preventDefault(); uploadZone.classList.add("dragover"); });
uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("dragover"));
uploadZone.addEventListener("drop", e => {
  e.preventDefault();
  uploadZone.classList.remove("dragover");
  if (e.dataTransfer.files[0]) {
    fileInput.files = e.dataTransfer.files;
    showFileName(e.dataTransfer.files[0].name);
  }
});
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) showFileName(fileInput.files[0].name);
});
function showFileName(name) {
  fileChosen.textContent = `✓ ${name}`;
  fileChosen.classList.remove("hidden");
}

// Form submit
const form       = document.getElementById("analyzeForm");
const analyzeBtn = document.getElementById("analyzeBtn");
const btnText    = analyzeBtn.querySelector(".btn-text");
const btnLoader  = analyzeBtn.querySelector(".btn-loader");
const errorBanner = document.getElementById("errorBanner");
const resultsSection = document.getElementById("resultsSection");

form.addEventListener("submit", async e => {
  e.preventDefault();
  setLoading(true);
  hideError();
  resultsSection.classList.add("hidden");

  const fd = new FormData(form);
  // If paste tab is active, remove file field; if upload tab active, remove text field
  const isUploadTab = document.getElementById("tab-upload").classList.contains("active");
  if (!isUploadTab) fd.delete("resume_file");

  try {
    const res = await fetch("/analyze", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok || data.error) {
      showError(data.error || "Something went wrong. Please try again.");
    } else {
      renderResults(data.result);
    }
  } catch {
    showError("Network error. Please check your connection and try again.");
  } finally {
    setLoading(false);
  }
});

function setLoading(on) {
  analyzeBtn.disabled = on;
  btnText.classList.toggle("hidden", on);
  btnLoader.classList.toggle("hidden", !on);
}
function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.classList.remove("hidden");
  errorBanner.scrollIntoView({ behavior: "smooth", block: "center" });
}
function hideError() { errorBanner.classList.add("hidden"); }

// Render results
function renderResults(r) {
  // Verdict
  const badge = document.getElementById("verdictBadge");
  badge.textContent = r.verdict;
  badge.className = "verdict-badge " + verdictClass(r.verdict);
  document.getElementById("verdictReason").textContent = r.verdict_reason;

  // Score ring
  const score = Math.min(100, Math.max(0, r.fit_score));
  document.getElementById("fitScore").textContent = score;
  const circumference = 314;
  const offset = circumference - (score / 100) * circumference;
  setTimeout(() => {
    document.getElementById("ringFill").style.strokeDashoffset = offset;
    document.getElementById("ringFill").style.stroke = scoreColor(score);
  }, 100);

  // Chance
  const chance = Math.min(100, Math.max(0, r.job_chance_percentage));
  const clabel = document.getElementById("chanceLabel");
  clabel.textContent = r.job_chance_label;
  clabel.className = "chance-label " + r.job_chance_label.toLowerCase().replace(" ", "-");
  document.getElementById("chancePct").textContent = chance + "%";
  setTimeout(() => { document.getElementById("chanceBar").style.width = chance + "%"; }, 100);
  document.getElementById("experienceGap").textContent = r.experience_gap
    ? "Experience gap: " + r.experience_gap : "";

  // Skills
  renderTags("matchedSkills", r.matched_skills || [], "matched");
  renderTags("missingSkills", r.missing_skills || [], "missing");

  // Improve
  const improveList = document.getElementById("improveList");
  improveList.innerHTML = "";
  (r.skills_to_improve || []).forEach(s => {
    improveList.innerHTML += `
      <div class="improve-item">
        <div class="improve-skill">${esc(s.skill)}</div>
        <div class="improve-reason">${esc(s.reason)}</div>
        <div class="improve-suggestion">Tip: ${esc(s.suggestion)}</div>
      </div>`;
  });
  document.getElementById("improveCard").style.display =
    (r.skills_to_improve || []).length ? "" : "none";

  // Strengths & Recommendations
  renderList("strengthsList", r.strengths || []);
  renderList("recommendationsList", r.recommendations || []);

  // Bias
  document.getElementById("biasResume").textContent =
    r.bias_flags?.resume_issues || "None detected";
  document.getElementById("biasJD").textContent =
    r.bias_flags?.jd_issues || "None detected";

  resultsSection.classList.remove("hidden");
  resultsSection.scrollIntoView({ behavior: "smooth" });
}

function renderTags(containerId, items, cls) {
  const el = document.getElementById(containerId);
  el.innerHTML = items.length
    ? items.map(s => `<span class="skill-tag ${cls}">${esc(s)}</span>`).join("")
    : `<span style="font-size:13px;color:#5f6368">None identified</span>`;
}
function renderList(containerId, items) {
  document.getElementById(containerId).innerHTML =
    items.map(i => `<li>${esc(i)}</li>`).join("");
}
function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function verdictClass(v) {
  if (!v) return "";
  const l = v.toLowerCase();
  if (l.includes("strong")) return "verdict-strong";
  if (l.includes("good"))   return "verdict-good";
  if (l.includes("partial")) return "verdict-partial";
  return "verdict-not";
}
function scoreColor(score) {
  if (score >= 75) return "#34a853";
  if (score >= 50) return "#1a73e8";
  if (score >= 30) return "#fbbc04";
  return "#ea4335";
}

// Reset
document.getElementById("resetBtn").addEventListener("click", () => {
  resultsSection.classList.add("hidden");
  form.reset();
  document.getElementById("fileChosen").classList.add("hidden");
  document.getElementById("ringFill").style.strokeDashoffset = "314";
  document.getElementById("chanceBar").style.width = "0%";
  hideError();
  window.scrollTo({ top: 0, behavior: "smooth" });
});
