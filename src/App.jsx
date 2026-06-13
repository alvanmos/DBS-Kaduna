import React, { useEffect, useRef, useState } from "react";
import {
  CaretDown,
  CaretLeft,
  CaretRight,
  GraduationCap,
  LockKey,
  ShieldCheck,
  UserCircle,
  UsersThree,
  WhatsappLogo,
} from "@phosphor-icons/react";

const GUIDE_COUNT = 26;
const dbsKadunaLogo = "/dbs-kaduna-logo.png?v=20260613";
const voiceOfProphecyLogo = "/voice-of-prophecy-logo.png?v=20260613";
const guideImages = Array.from(
  { length: GUIDE_COUNT },
  (_, index) =>
    `/landing-page-photos/guide-${String(index + 1).padStart(2, "0")}.jpg`,
);

const loginOptions = [
  {
    label: "Student login",
    href: "/login/student",
    Icon: GraduationCap,
    tone: "green",
  },
  {
    label: "Instructor login",
    href: "/login/instructor",
    Icon: UserCircle,
    tone: "blue",
  },
  {
    label: "Admin login",
    href: "/login/admin",
    Icon: ShieldCheck,
    tone: "gold",
  },
];

const whatsappNumber = "2348100171970";
const studentRegistration = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
  "Hello DBS Kaduna, I would like to register as a student.",
)}`;
const instructorRegistration = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
  "Hello DBS Kaduna, I would like to register as a volunteer instructor.",
)}`;

function LoginMenu({ isOpen, menuId, onToggle, variant = "action" }) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function closeOnOutsideClick(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onToggle(false);
      }
    }

    function closeOnEscape(event) {
      if (event.key === "Escape") {
        onToggle(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen, onToggle]);

  return (
    <div
      className={`login-menu login-menu--${variant}`}
      ref={menuRef}
    >
      <button
        className={`login-trigger login-trigger--${variant}`}
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => onToggle(!isOpen)}
      >
        {variant === "header" ? (
          <UserCircle aria-hidden="true" size={20} weight="bold" />
        ) : (
          <LockKey aria-hidden="true" size={23} weight="bold" />
        )}
        <span>Login</span>
        <CaretDown
          className={isOpen ? "login-caret login-caret--open" : "login-caret"}
          aria-hidden="true"
          size={18}
          weight="bold"
        />
      </button>

      {isOpen && (
        <div className="login-options" id={menuId} role="menu">
          {loginOptions.map(({ label, href, Icon, tone }) => (
            <a className="login-option" href={href} role="menuitem" key={label}>
              <span className={`login-option__icon login-option__icon--${tone}`}>
                <Icon aria-hidden="true" size={24} weight="duotone" />
              </span>
              <span>{label}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function GuideCarousel({ currentGuide, onSelect, onNext, onPrevious }) {
  const visibleGuides = [-2, -1, 0, 1, 2].map((offset) => ({
    index: (currentGuide + offset + GUIDE_COUNT) % GUIDE_COUNT,
    position: offset,
  }));
  const positionClasses = {
    "-2": "previous-2",
    "-1": "previous-1",
    0: "current",
    1: "next-1",
    2: "next-2",
  };

  return (
    <section
      className="guide-carousel"
      id="study-guides"
      aria-label="Discover Bible study guides"
    >
      <div className="guide-stage">
        <button
          className="carousel-arrow carousel-arrow--previous"
          type="button"
          onClick={onPrevious}
          aria-label="Show previous study guide"
        >
          <CaretLeft aria-hidden="true" size={34} weight="bold" />
        </button>

        <div className="guide-stack">
          {visibleGuides.map(({ index, position }) => (
            <button
              className={`guide-card guide-card--${positionClasses[position]}`}
              type="button"
              key={`${index}-${position}`}
              onClick={() => position !== 0 && onSelect(index)}
              aria-label={
                position === 0
                  ? `Study guide ${index + 1}, currently selected`
                  : `Show study guide ${index + 1}`
              }
              aria-current={position === 0 ? "true" : undefined}
              tabIndex={position === 0 ? -1 : 0}
            >
              <img
                src={guideImages[index]}
                alt={`Front cover of Discover Bible Study Guide ${index + 1}`}
                loading={position === 0 ? "eager" : "lazy"}
                draggable="false"
              />
            </button>
          ))}
        </div>

        <button
          className="carousel-arrow carousel-arrow--next"
          type="button"
          onClick={onNext}
          aria-label="Show next study guide"
        >
          <CaretRight aria-hidden="true" size={34} weight="bold" />
        </button>
      </div>

      <div className="carousel-meta">
        <p className="guide-counter">
          Study Guide <strong>{currentGuide + 1}</strong> of {GUIDE_COUNT}
        </p>
        <div className="carousel-dots" aria-label="Choose a study guide">
          {guideImages.map((_, index) => (
            <button
              className={
                index === currentGuide
                  ? "carousel-dot carousel-dot--active"
                  : "carousel-dot"
              }
              type="button"
              key={index}
              onClick={() => onSelect(index)}
              aria-label={`Show study guide ${index + 1}`}
              aria-current={index === currentGuide ? "true" : undefined}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export function App() {
  const [currentGuide, setCurrentGuide] = useState(0);
  const [activeLoginMenu, setActiveLoginMenu] = useState(null);
  const [isCarouselPaused, setIsCarouselPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () =>
      setPrefersReducedMotion(mediaQuery.matches);

    updateMotionPreference();
    mediaQuery.addEventListener("change", updateMotionPreference);
    return () =>
      mediaQuery.removeEventListener("change", updateMotionPreference);
  }, []);

  useEffect(() => {
    if (isCarouselPaused || prefersReducedMotion) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setCurrentGuide((guide) => (guide + 1) % GUIDE_COUNT);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [isCarouselPaused, prefersReducedMotion]);

  const showNextGuide = () =>
    setCurrentGuide((guide) => (guide + 1) % GUIDE_COUNT);
  const showPreviousGuide = () =>
    setCurrentGuide((guide) => (guide - 1 + GUIDE_COUNT) % GUIDE_COUNT);

  return (
    <main className="site-shell">
      <header className="brand-header" aria-label="Discover Bible School">
        <div className="brand-lockup">
          <a className="brand-link brand-link--dbs" href="#home" aria-label="Home">
            <img src={dbsKadunaLogo} alt="DBS Kaduna" />
          </a>
          <span className="brand-divider" aria-hidden="true" />
          <a
            className="brand-link brand-link--vop"
            href="https://www.voiceofprophecy.com/"
            target="_blank"
            rel="noreferrer"
          >
            <img
              src={voiceOfProphecyLogo}
              alt="Voice of Prophecy"
            />
          </a>
        </div>

        <nav className="site-nav" aria-label="Primary navigation">
          <a className="site-nav__link site-nav__link--active" href="#home">
            Home
          </a>
          <a className="site-nav__link" href="#welcome">
            About Us
          </a>
          <a className="site-nav__link" href="#study-guides">
            Study Guides
          </a>
          <a className="site-nav__link" href="#welcome">
            How It Works
          </a>
          <a className="site-nav__link" href={instructorRegistration}>
            Become an Instructor
          </a>
          <a className="site-nav__link" href="#contact">
            Contact Us
          </a>
        </nav>

        <LoginMenu
          isOpen={activeLoginMenu === "header"}
          menuId="header-login-options"
          onToggle={(isOpen) => setActiveLoginMenu(isOpen ? "header" : null)}
          variant="header"
        />
      </header>

      <section className="welcome-panel" id="home" aria-labelledby="welcome-heading">
        <div id="welcome">
          <h1 id="welcome-heading">
            Discover Bible School, Kaduna.
          </h1>
          <p className="hero-summary">
            Free Bible School Correspondence Course for Your Spiritual Growth.
          </p>
        </div>

        <div className="primary-actions" aria-label="Registration and login">
          <a
            className="action-button action-button--student"
            href={studentRegistration}
            target="_blank"
            rel="noreferrer"
          >
            <GraduationCap aria-hidden="true" size={25} weight="fill" />
            <span>Register as Student</span>
          </a>

          <a
            className="action-button action-button--instructor"
            href={instructorRegistration}
            target="_blank"
            rel="noreferrer"
          >
            <UsersThree aria-hidden="true" size={25} weight="fill" />
            <span>Register as Volunteer Instructor</span>
          </a>

          <LoginMenu
            isOpen={activeLoginMenu === "action"}
            menuId="action-login-options"
            onToggle={(isOpen) => setActiveLoginMenu(isOpen ? "action" : null)}
          />
        </div>

        <div
          className="carousel-panel"
          onPointerEnter={() => setIsCarouselPaused(true)}
          onPointerLeave={() => setIsCarouselPaused(false)}
          onFocusCapture={() => setIsCarouselPaused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setIsCarouselPaused(false);
            }
          }}
        >
          <GuideCarousel
            currentGuide={currentGuide}
            onSelect={setCurrentGuide}
            onNext={showNextGuide}
            onPrevious={showPreviousGuide}
          />
        </div>
      </section>

      <footer className="help-band" id="contact">
        <a
          className="whatsapp-help"
          href={`https://wa.me/${whatsappNumber}`}
          target="_blank"
          rel="noreferrer"
        >
          <span className="whatsapp-help__icon">
            <WhatsappLogo aria-hidden="true" size={42} weight="fill" />
          </span>
          <span className="help-band__message">
            <strong>Need Help?</strong>
            <small>We&apos;re here to support you on your learning journey.</small>
          </span>
          <span className="help-band__divider" aria-hidden="true" />
          <span className="help-band__contact">
            <small>Chat with us on WhatsApp</small>
            <strong>+234 810 017 1970</strong>
          </span>
        </a>
      </footer>
    </main>
  );
}
