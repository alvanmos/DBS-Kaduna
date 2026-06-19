import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle,
  EnvelopeSimple,
  GraduationCap,
  MapPin,
  Phone,
  User,
  UsersThree,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  loadRecruitmentCampaign,
  loadRegistrationForm,
  submitRecruitmentEnrolment,
} from "./recruitmentRepository.js";
import "./registration.css";

const roleContent = {
  student: {
    kind: "student",
    label: "Student",
    fallbackTitle: "Register as a Student",
    fallbackDescription:
      "Begin the free Discover Bible School correspondence course and grow through 26 guided lessons.",
    Icon: GraduationCap,
  },
  "volunteer-instructor": {
    kind: "volunteer_instructor",
    label: "Volunteer Instructor",
    fallbackTitle: "Register as a Volunteer Instructor",
    fallbackDescription:
      "Join DBS Kaduna in guiding students through their Bible study journey.",
    Icon: UsersThree,
  },
};

const fieldIcons = {
  full_name: User,
  email: EnvelopeSimple,
  phone: Phone,
  address: MapPin,
};

function readableError(error) {
  return error?.message || "Registration could not be submitted. Please try again.";
}

function emptyValueFor(field) {
  return field.type === "checkbox" ? false : "";
}

function DynamicField({ field, value, onChange }) {
  const FieldIcon = fieldIcons[field.key];
  const commonProps = {
    id: `registration-${field.key}`,
    name: field.key,
    required: field.required,
    value: value ?? "",
    onChange: (event) => onChange(field.key, event.target.value),
  };

  if (field.type === "checkbox") {
    return (
      <label className="registration-checkbox" htmlFor={commonProps.id}>
        <input
          id={commonProps.id}
          name={field.key}
          type="checkbox"
          checked={Boolean(value)}
          required={field.required}
          onChange={(event) => onChange(field.key, event.target.checked)}
        />
        <span>{field.label}</span>
        <small>{field.required ? "Required" : "Optional"}</small>
      </label>
    );
  }

  return (
    <label htmlFor={commonProps.id}>
      <span className="registration-label-text">
        {field.label}
        <small>{field.required ? "Required" : "Optional"}</small>
      </span>
      <span className={field.type === "textarea" ? "registration-form__textarea" : ""}>
        {FieldIcon && <FieldIcon aria-hidden="true" size={20} />}
        {field.type === "textarea" ? (
          <textarea {...commonProps} rows="4" placeholder={`Enter ${field.label.toLowerCase()}`} />
        ) : field.type === "select" ? (
          <select {...commonProps}>
            <option value="">Choose an option</option>
            {(field.options ?? []).map((option) => (
              <option value={option} key={option}>{option}</option>
            ))}
          </select>
        ) : (
          <input
            {...commonProps}
            type={["email", "tel", "number", "date"].includes(field.type) ? field.type : "text"}
            autoComplete={
              field.key === "full_name"
                ? "name"
                : field.key === "email"
                  ? "email"
                  : field.key === "phone"
                    ? "tel"
                    : field.key === "address"
                      ? "street-address"
                      : "off"
            }
            placeholder={`Enter ${field.label.toLowerCase()}`}
          />
        )}
      </span>
    </label>
  );
}

export function RegistrationPage({ role }) {
  const content = roleContent[role] ?? roleContent.student;
  const campaignSlug = new URLSearchParams(window.location.search).get("campaign") ?? "";
  const [registrationForm, setRegistrationForm] = useState(null);
  const [campaignStatus, setCampaignStatus] = useState(campaignSlug ? "loading" : "none");
  const [pageStatus, setPageStatus] = useState("loading");
  const [formData, setFormData] = useState({ website: "" });
  const [submitStatus, setSubmitStatus] = useState("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      loadRegistrationForm(content.kind),
      campaignSlug
        ? loadRecruitmentCampaign(campaignSlug, content.kind)
        : Promise.resolve(null),
    ])
      .then(([form, campaign]) => {
        if (controller.signal.aborted) return;
        if (!form) throw new Error("This registration form is not published.");
        setRegistrationForm(form);
        setFormData({
          website: "",
          ...Object.fromEntries(
            (form.fields ?? []).map((field) => [field.key, emptyValueFor(field)]),
          ),
        });
        setCampaignStatus(campaignSlug ? (campaign ? "ready" : "invalid") : "none");
        setPageStatus("ready");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setMessage(readableError(error));
        setPageStatus("error");
      });
    return () => controller.abort();
  }, [campaignSlug, content.kind]);

  const title = registrationForm?.title ?? content.fallbackTitle;
  const description = registrationForm?.description ?? content.fallbackDescription;
  useEffect(() => {
    document.title = `${title} | DBS Kaduna`;
  }, [title]);

  const fields = useMemo(() => registrationForm?.fields ?? [], [registrationForm]);

  function updateField(field, value) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  async function submitRegistration(event) {
    event.preventDefault();
    setSubmitStatus("submitting");
    setMessage("");
    try {
      const result = await submitRecruitmentEnrolment({
        campaignSlug,
        recruitmentKind: content.kind,
        formData,
      });
      setMessage(result.message);
      setSubmitStatus("complete");
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
          <span><strong>Discover Bible School</strong><small>Kaduna</small></span>
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
          <h1>{title}</h1>
          <span>{description}</span>
        </div>

        <div className="registration-card">
          {submitStatus === "complete" ? (
            <div className="registration-success" role="status">
              <CheckCircle aria-hidden="true" size={58} weight="duotone" />
              <h2>Registration received</h2>
              <p>{message}</p>
              <a href="/">Return to homepage</a>
            </div>
          ) : pageStatus === "loading" ? (
            <div className="registration-loading">Loading registration form...</div>
          ) : pageStatus === "error" ? (
            <div className="registration-notice registration-notice--error" role="alert">
              <WarningCircle aria-hidden="true" size={22} />
              <span>{message}</span>
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
                  <span>This recruitment link is invalid or no longer active.</span>
                </div>
              )}

              <form className="registration-form" onSubmit={submitRegistration}>
                <label className="registration-honeypot" aria-hidden="true">
                  Website
                  <input
                    tabIndex="-1"
                    autoComplete="off"
                    value={formData.website ?? ""}
                    onChange={(event) => updateField("website", event.target.value)}
                  />
                </label>
                {fields.map((field) => (
                  <DynamicField
                    field={field}
                    value={formData[field.key]}
                    onChange={updateField}
                    key={field.key}
                  />
                ))}

                {submitStatus === "error" && (
                  <div className="registration-notice registration-notice--error" role="alert">
                    <WarningCircle aria-hidden="true" size={22} />
                    <span>{message}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitStatus === "submitting" || campaignIsInvalid}
                >
                  <Icon aria-hidden="true" size={22} weight="bold" />
                  {submitStatus === "submitting"
                    ? "Submitting..."
                    : `Register as ${content.label}`}
                </button>
                <small className="registration-privacy">
                  Your details are sent securely to the DBS Kaduna administration team
                  and used only for registration and course administration.
                </small>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
