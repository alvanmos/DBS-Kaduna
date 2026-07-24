import React, { useEffect, useRef, useState } from "react";
import {
  CaretDown,
  CaretLeft,
  CaretRight,
  GraduationCap,
  LockKey,
  Newspaper,
  ShieldCheck,
  UserCircle,
  UsersThree,
  WhatsappLogo,
} from "@phosphor-icons/react";
import {
  isWithinNewsAlertWindow,
  loadPublishedNews,
  millisecondsUntilNewsAlertExpires,
} from "./news/publicNews.js";

const GUIDE_COUNT = 26;
const dbsKadunaLogo = "/dbs-kaduna-logo.png?v=20260614";
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
const studentRegistration = "/register/student";
const instructorRegistration = "/register/volunteer-instructor";
const howItWorksSteps = [
  {
    title: "Register for Free",
    description:
      "Start your Bible study journey by completing the online registration form.",
  },
  {
    title: "Get Access to Bible Lessons",
    description:
      "After registration, you will be enrolled into the Discover Bible School programme. You will receive access to Bible study lessons that you can read, download, and study.",
  },
  {
    title: "Study Each Lesson",
    description:
      "Each lesson is designed to help you understand the Bible better and grow spiritually. Read the lesson carefully, reflect on the message, and prepare to answer the study questions.",
  },
  {
    title: "Submit Your Answers",
    description:
      "At the end of each lesson, you will answer the questions provided and submit them online. Your responses help us know your progress and guide you better.",
  },
  {
    title: "Receive Teacher Feedback",
    description:
      "A trained Bible instructor will review your answers, make helpful comments, and guide you where necessary. You can also receive encouragement and support as you continue the lessons.",
  },
  {
    title: "Track Your Progress",
    description:
      "Your progress will be recorded as you complete each lesson. This helps both you and your instructor know how far you have gone in the programme.",
  },
  {
    title: "Complete the Course and Receive a Certificate",
    description:
      "After completing the required lessons, you will receive a certificate of completion from Discover Bible School, Kaduna. This certificate shows that you have successfully completed the Bible study programme.",
  },
  {
    title: "Continue Growing Spiritually",
    description:
      "The goal of Discover Bible School is not just to complete lessons, but to help you know God better, understand His Word, and apply Bible truths in your daily life.",
  },
];

function formatNewsDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

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
  const [hasRecentNews, setHasRecentNews] = useState(false);
  const [latestNews, setLatestNews] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    let expiryTimer;

    loadPublishedNews({ limit: 1, signal: controller.signal })
      .then(([latestNews]) => {
        if (!latestNews?.publishedAt) return;

        setLatestNews(latestNews);
        setHasRecentNews(isWithinNewsAlertWindow(latestNews.publishedAt));
        const remainingTime = millisecondsUntilNewsAlertExpires(
          latestNews.publishedAt,
        );
        if (remainingTime > 0) {
          expiryTimer = window.setTimeout(
            () => setHasRecentNews(false),
            remainingTime,
          );
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setHasRecentNews(false);
      });

    return () => {
      controller.abort();
      window.clearTimeout(expiryTimer);
    };
  }, []);

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
          <a className="site-nav__link" href="#how-it-works">
            How It Works
          </a>
          <a className="site-nav__link" href={instructorRegistration}>
            Become an Instructor
          </a>
          <a className="site-nav__link" href="#contact">
            Contact Us
          </a>
        </nav>

        <a
          className={
            hasRecentNews
              ? "news-button news-button--recent"
              : "news-button"
          }
          href="/news"
          target="_blank"
          rel="noreferrer"
          aria-label={
            hasRecentNews
              ? "Open newly published DBS Kaduna news in a new window"
              : "Open DBS Kaduna news in a new window"
          }
        >
          <Newspaper aria-hidden="true" size={20} weight="bold" />
          <span>News</span>
          {hasRecentNews && <small>New</small>}
        </a>
      </header>

      <section className="welcome-panel" id="home" aria-labelledby="welcome-heading">
        <div id="welcome">
          {latestNews && (
            <div className="news-ticker" aria-label="Latest DBS Kaduna news">
              <a className="news-ticker__content" href="/news" target="_blank" rel="noreferrer">
                <Newspaper aria-hidden="true" size={17} weight="fill" />
                <strong>{latestNews.title}</strong>
                <time dateTime={latestNews.publishedAt}>
                  {formatNewsDate(latestNews.publishedAt)}
                </time>
              </a>
            </div>
          )}
          <h1 id="welcome-heading">
            Discover Bible School, Kaduna
          </h1>
          <p className="hero-summary">
            Free Bible School Correspondence Course for Your Spiritual Growth
          </p>
        </div>

        <div className="primary-actions" aria-label="Registration and login">
          <a
            className="action-button action-button--student"
            href={studentRegistration}
          >
            <GraduationCap aria-hidden="true" size={25} weight="fill" />
            <span>Register as Student</span>
          </a>

          <a
            className="action-button action-button--instructor"
            href={instructorRegistration}
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

      <section className="how-it-works" id="how-it-works" aria-labelledby="how-it-works-title">
        <div className="how-it-works__header">
          <p>How It Works</p>
          <h2 id="how-it-works-title">A simple path through the Discover Bible School journey</h2>
          <span>
            From registration to certificate, each step is designed to help you study the Bible with guidance, feedback, and steady spiritual growth.
          </span>
        </div>

        <div className="how-it-works__grid">
          {howItWorksSteps.map((step, index) => (
            <article className="how-it-works__card" key={step.title}>
              <small>Step {index + 1}</small>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
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
