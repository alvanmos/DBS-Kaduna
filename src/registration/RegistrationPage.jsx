import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle,
  EnvelopeSimple,
  GraduationCap,
  LockKey,
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

const privacyConsentField = {
  key: "privacy_consent",
  label:
    "I consent to DBS Kaduna using my details for registration, course administration, and instructor support in line with the Privacy Notice.",
  type: "checkbox",
  required: true,
  system: true,
};

const passwordField = {
  key: "password",
  label: "Password",
  type: "password",
  required: true,
  system: true,
};

const fallbackFieldsByRole = {
  student: [
    { key: "full_name", label: "Full name", type: "text", required: true, system: true },
    { key: "email", label: "Email address", type: "email", required: true, system: true },
    { key: "username", label: "Username", type: "text", required: true, system: true },
    passwordField,
    { key: "phone", label: "Phone number", type: "tel", required: true, system: true },
    { key: "address", label: "Residential address", type: "textarea", required: true, system: true },
    { key: "denomination", label: "Denomination", type: "text", required: false },
    {
      key: "is_adventist",
      label: "Are you a Seventh-day Adventist?",
      type: "checkbox",
      required: false,
    },
  ],
  volunteer_instructor: [
    { key: "full_name", label: "Full name", type: "text", required: true, system: true },
    { key: "email", label: "Email address", type: "email", required: true, system: true },
    { key: "username", label: "Username", type: "text", required: true, system: true },
    passwordField,
    { key: "phone", label: "Phone number", type: "tel", required: true, system: true },
    { key: "address", label: "Residential address", type: "textarea", required: true, system: true },
    {
      key: "statement",
      label: "Why would you like to volunteer?",
      type: "textarea",
      required: true,
    },
  ],
};

const fieldIcons = {
  full_name: User,
  email: EnvelopeSimple,
  username: User,
  password: LockKey,
  phone: Phone,
  address: MapPin,
};

function readableError(error) {
  return error?.message || "Registration could not be submitted. Please try again.";
}

function emptyValueFor(field) {
  return field.type === "checkbox" ? false : "";
}

function withConsentField(fields = []) {
  const fieldsWithoutConsent = fields.filter(
    (field) =>
      field.key !== privacyConsentField.key,
  );
  const configuredPassword = fieldsWithoutConsent.find(
    (field) => field.key === passwordField.key || field.type === passwordField.type,
  );
  const fieldsWithoutPassword = fieldsWithoutConsent.filter(
    (field) => field.key !== passwordField.key && field.type !== passwordField.type,
  );
  const fieldsWithPasswordAfterUsername = fieldsWithoutPassword.flatMap((field) =>
    field.key === "username"
      ? [field, { ...configuredPassword, ...passwordField }]
      : [field],
  );

  return [...fieldsWithPasswordAfterUsername, privacyConsentField];
}

function DynamicField({ field, value, onChange, disabled = false }) {
  const FieldIcon = fieldIcons[field.key];
  const commonProps = {
    id: `registration-${field.key}`,
    name: field.key,
    required: field.required,
    value: value ?? "",
    disabled,
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
          disabled={disabled}
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
            type={
              ["email", "tel", "number", "date"].includes(field.type)
                ? field.type
                : field.type === "password"
                  ? "password"
                : "text"
            }
            autoComplete={
              field.key === "full_name"
                ? "name"
                : field.key === "email"
                  ? "email"
                  : field.key === "username"
                    ? "username"
                    : field.key === "password"
                      ? "new-password"
                    : field.key === "phone"
                        ? "tel"
                        : field.key === "address"
                          ? "street-address"
                          : "off"
            }
            spellCheck={field.key === "username" ? false : undefined}
            minLength={field.key === "password" ? 10 : undefined}
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
            withConsentField(form.fields ?? []).map((field) => [field.key, emptyValueFor(field)]),
          ),
        });
        setCampaignStatus(campaignSlug ? (campaign ? "ready" : "invalid") : "none");
        setPageStatus("ready");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        const nextMessage = readableError(error);
        if (/not configured/i.test(nextMessage)) {
          const fallbackForm = {
            title: content.fallbackTitle,
            description: content.fallbackDescription,
            fields: fallbackFieldsByRole[content.kind] ?? [],
          };
          setRegistrationForm(fallbackForm);
          setFormData({
            website: "",
            ...Object.fromEntries(
              fallbackForm.fields.map((field) => [field.key, emptyValueFor(field)]),
            ),
            privacy_consent: false,
          });
          setMessage(
            "Live registration is unavailable in this local preview because Supabase is not configured here.",
          );
          setPageStatus("preview");
          return;
        }
        setMessage(nextMessage);
        setPageStatus("error");
      });
    return () => controller.abort();
  }, [campaignSlug, content.kind]);

  const title = registrationForm?.title ?? content.fallbackTitle;
  const description = registrationForm?.description ?? content.fallbackDescription;
  useEffect(() => {
    document.title = `${title} | DBS Kaduna`;
  }, [title]);

  const fields = useMemo(
    () => withConsentField(registrationForm?.fields ?? []),
    [registrationForm],
  );
  const successHref = content.kind === "student" ? "/login/student" : "/";
  const successLabel =
    content.kind === "student" ? "Proceed to student login" : "Return to homepage";

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
  const registrationUnavailable = pageStatus === "preview";

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
          {content.kind === "student" && (
            <strong className="registration-intro__free">It's Totally Free</strong>
          )}
          <span>{description}</span>
        </div>

        <div className="registration-card">
          <section className="registration-privacy-notice" aria-labelledby="privacy-notice-title">
            <div>
              <p>Privacy Notice</p>
              <h3 id="privacy-notice-title">How DBS Kaduna uses your information</h3>
            </div>
            <ul>
              <li>We collect the information you provide to register you, contact you, assign an instructor, and manage lessons, progress, and certificates.</li>
              <li>Your personal details are kept for DBS Kaduna administration and learning support and are not published on the public website.</li>
              <li>Students can request correction or deletion of their data from the student dashboard after signing in.</li>
            </ul>
          </section>

          {submitStatus === "complete" ? (
            <div className="registration-success" role="status">
              <CheckCircle aria-hidden="true" size={58} weight="duotone" />
              <h2>Registration received</h2>
              <p>{message}</p>
              <a href={successHref}>{successLabel}</a>
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

              {registrationUnavailable && (
                <div className="registration-notice registration-notice--warning" role="status">
                  <WarningCircle aria-hidden="true" size={22} />
                  <span>{message}</span>
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
                    disabled={registrationUnavailable}
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
                  disabled={
                    submitStatus === "submitting" ||
                    campaignIsInvalid ||
                    registrationUnavailable
                  }
                >
                  <Icon aria-hidden="true" size={22} weight="bold" />
                  {registrationUnavailable
                    ? "Registration unavailable in this preview"
                    : submitStatus === "submitting"
                    ? "Submitting..."
                    : `Register as ${content.label}`}
                </button>
                <small className="registration-privacy">
                  Your details are sent securely to the DBS Kaduna administration team
                  and used only for registration, course administration, and learner support.
                </small>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
