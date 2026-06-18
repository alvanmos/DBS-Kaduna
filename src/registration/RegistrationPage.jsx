import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle,
  GraduationCap,
  MapPin,
  Phone,
  User,
  UsersThree,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  loadRecruitmentCampaign,
  submitRecruitmentEnrolment,
} from "./recruitmentRepository.js";
import "./registration.css";

const roleContent = {
  student: {
    kind: "student",
    label: "Student",
    title: "Register as a Student",
    description:
      "Begin the free Discover Bible School correspondence course and grow through 26 guided lessons.",
    Icon: GraduationCap,
  },
  "volunteer-instructor": {
    kind: "volunteer_instructor",
    label: "Volunteer Instructor",
    title: "Register as a Volunteer Instructor",
    description:
      "Join DBS Kaduna in guiding students through their Bible study journey.",
    Icon: UsersThree,
  },
};

function readableError(error) {
  return error?.message || "Registration could not be submitted. Please try again.";
}

export function RegistrationPage({ role }) {
  const content = roleContent[role] ?? roleContent.student;
  const campaignSlug = new URLSearchParams(window.location.search).get("campaign") ?? "";
  const [campaign, setCampaign] = useState(null);
  const [campaignStatus, setCampaignStatus] = useState(
    campaignSlug ? "loading" : "none",
  );
  const [form, setForm] = useState({ fullName: "", phone: "", address: "" });
  const [submitStatus, setSubmitStatus] = useState("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    document.title = `${content.title} | DBS Kaduna`;
  }, [content.title]);

  useEffect(() => {
    if (!campaignSlug) return undefined;
    const controller = new AbortController();

    loadRecruitmentCampaign(campaignSlug, content.kind)
      .then((item) => {
        if (controller.signal.aborted) return;
        setCampaign(item);
        setCampaignStatus(item ? "ready" : "invalid");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setCampaignStatus("invalid");
        setMessage(readableError(error));
      });

    return () => controller.abort();
  }, [campaignSlug, content.kind]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitRegistration(event) {
    event.preventDefault();
    setSubmitStatus("submitting");
    setMessage("");
    try {
      await submitRecruitmentEnrolment({
        campaignSlug,
        recruitmentKind: content.kind,
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
      });
      setSubmitStatus("complete");
      setForm({ fullName: "", phone: "", address: "" });
    } catch (error) {
      setSubmitStatus("error");
      setMessage(readableError(error));
    }
  }

  const Icon = content.Icon;
  const campaignIsInvalid = campaignStatus === "invalid";

  return (
    <main className="registration-shell">
      <header className="registration-header">
        <a href="/" className="registration-brand" aria-label="DBS Kaduna home">
          <img src="/dbs-kaduna-logo.png?v=20260614" alt="DBS Kaduna" />
          <span>
            <strong>Discover Bible School</strong>
            <small>Kaduna</small>
          </span>
        </a>
        <a className="registration-back" href="/">
          <ArrowLeft aria-hidden="true" size={19} weight="bold" />
          Back to homepage
        </a>
      </header>

      <section className="registration-layout">
        <div className="registration-intro">
          <span className="registration-intro__icon">
            <Icon aria-hidden="true" size={35} weight="duotone" />
          </span>
          <p>DBS Kaduna registration</p>
          <h1>{content.title}</h1>
          <span>{content.description}</span>
          {campaign && (
            <div className="registration-campaign">
              <small>Recruitment campaign</small>
              <strong>{campaign.name}</strong>
            </div>
          )}
        </div>

        <div className="registration-card">
          {submitStatus === "complete" ? (
            <div className="registration-success" role="status">
              <CheckCircle aria-hidden="true" size={58} weight="duotone" />
              <h2>Registration received</h2>
              <p>
                Thank you for registering as a {content.label.toLowerCase()}.
                The DBS Kaduna team will contact you using the phone number you provided.
              </p>
              <a href="/">Return to homepage</a>
            </div>
          ) : (
            <>
              <div className="registration-card__heading">
                <p>Your details</p>
                <h2>Tell us how to reach you</h2>
              </div>

              {campaignIsInvalid && (
                <div className="registration-notice registration-notice--error" role="alert">
                  <WarningCircle aria-hidden="true" size={22} />
                  <span>
                    {message ||
                      "This recruitment campaign link is invalid or no longer active."}
                  </span>
                </div>
              )}

              <form className="registration-form" onSubmit={submitRegistration}>
                <label>
                  Full name
                  <span>
                    <User aria-hidden="true" size={20} />
                    <input
                      type="text"
                      value={form.fullName}
                      onChange={(event) => updateField("fullName", event.target.value)}
                      autoComplete="name"
                      placeholder="Enter your full name"
                      minLength="2"
                      required
                    />
                  </span>
                </label>

                <label>
                  Phone number
                  <span>
                    <Phone aria-hidden="true" size={20} />
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(event) => updateField("phone", event.target.value)}
                      autoComplete="tel"
                      placeholder="e.g. +234 810 000 0000"
                      minLength="7"
                      required
                    />
                  </span>
                </label>

                <label>
                  Residential address
                  <span className="registration-form__textarea">
                    <MapPin aria-hidden="true" size={20} />
                    <textarea
                      rows="4"
                      value={form.address}
                      onChange={(event) => updateField("address", event.target.value)}
                      autoComplete="street-address"
                      placeholder="Enter your current address"
                      minLength="4"
                      required
                    />
                  </span>
                </label>

                {submitStatus === "error" && !campaignIsInvalid && (
                  <div className="registration-notice registration-notice--error" role="alert">
                    <WarningCircle aria-hidden="true" size={22} />
                    <span>{message}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={
                    submitStatus === "submitting" ||
                    campaignStatus === "loading" ||
                    campaignIsInvalid
                  }
                >
                  <Icon aria-hidden="true" size={22} weight="bold" />
                  {submitStatus === "submitting"
                    ? "Submitting..."
                    : `Register as ${content.label}`}
                </button>
                <small className="registration-privacy">
                  Your details are sent securely to the DBS Kaduna administration team
                  and used only to follow up on this registration.
                </small>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
