import os
import json
import io
from flask import Flask, request, jsonify, render_template
from dotenv import load_dotenv
from google import genai
from google.genai import types
import PyPDF2
from docx import Document

load_dotenv()

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10MB max upload

client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))


def extract_text_from_pdf(file_bytes):
    reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def extract_text_from_docx(file_bytes):
    doc = Document(io.BytesIO(file_bytes))
    return "\n".join(para.text for para in doc.paragraphs)


def extract_resume_text(file):
    file_bytes = file.read()
    filename = file.filename.lower()
    if filename.endswith(".pdf"):
        return extract_text_from_pdf(file_bytes)
    elif filename.endswith(".docx"):
        return extract_text_from_docx(file_bytes)
    else:
        return file_bytes.decode("utf-8", errors="ignore")


ANALYSIS_PROMPT = """
You are an unbiased AI recruitment assistant. Your role is to evaluate candidate fit
based STRICTLY on skills, qualifications, experience, and job requirements.

FAIRNESS RULES — you must follow these without exception:
- Ignore and do not factor in: name, gender, age, ethnicity, nationality, religion,
  marital status, address/location (unless role requires it), photo references,
  graduation year (as a proxy for age), or any protected characteristic.
- Base your entire evaluation only on: technical skills, domain knowledge, relevant
  experience, certifications, projects, and measurable achievements.
- If the job description itself contains biased language, flag it.

JOB DESCRIPTION:
{job_description}

CANDIDATE RESUME:
{resume_text}

Respond with a valid JSON object (no markdown, no extra text) in this exact structure:
{{
  "fit_score": <integer 0-100>,
  "verdict": "<Strong Fit | Good Fit | Partial Fit | Not a Fit>",
  "verdict_reason": "<2-3 sentence summary of why this verdict was reached, skills-based only>",
  "matched_skills": ["<skill1>", "<skill2>"],
  "missing_skills": ["<skill1>", "<skill2>"],
  "skills_to_improve": [
    {{"skill": "<skill name>", "reason": "<why it matters for this role>", "suggestion": "<how to improve>"}}
  ],
  "strengths": ["<strength1>", "<strength2>"],
  "experience_gap": "<None | Minor | Moderate | Significant> — <brief explanation>",
  "job_chance_percentage": <integer 0-100>,
  "job_chance_label": "<Very High | High | Moderate | Low | Very Low>",
  "bias_flags": {{
    "resume_issues": "<any potentially biased info found in resume that was ignored, or 'None'>",
    "jd_issues": "<any biased language detected in job description, or 'None'>"
  }},
  "recommendations": ["<actionable recommendation 1>", "<actionable recommendation 2>"]
}}
"""


@app.route("/favicon.ico")
def favicon():
    return "", 204


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/analyze", methods=["POST"])
def analyze():
    job_description = request.form.get("job_description", "").strip()
    resume_text = request.form.get("resume_text", "").strip()

    if not job_description:
        return jsonify({"error": "Job description is required."}), 400

    if "resume_file" in request.files and request.files["resume_file"].filename:
        try:
            resume_text = extract_resume_text(request.files["resume_file"])
        except Exception as e:
            return jsonify({"error": f"Failed to parse resume file: {str(e)}"}), 400

    if not resume_text:
        return jsonify({"error": "Resume content is required (paste text or upload file)."}), 400

    prompt = ANALYSIS_PROMPT.format(
        job_description=job_description,
        resume_text=resume_text,
    )

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
        raw = response.text.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        result = json.loads(raw.strip())
        return jsonify({"success": True, "result": result})
    except json.JSONDecodeError:
        return jsonify({"error": "AI returned an unexpected format. Please try again."}), 500
    except Exception as e:
        return jsonify({"error": f"Analysis failed: {str(e)}"}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG", "false").lower() == "true")
