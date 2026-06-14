import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarBlank,
  Newspaper,
} from "@phosphor-icons/react";
import { loadPublishedNews } from "./publicNews.js";
import "./news.css";

const dbsKadunaLogo = "/dbs-kaduna-logo.png?v=20260614";
const voiceOfProphecyLogo = "/voice-of-prophecy-logo.png?v=20260613";

function formatPublishedDate(value) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}

function NewsMedia({ item }) {
  if (!item.mediaUrl) return null;

  if (item.mediaType === "video") {
    return (
      <video className="public-news-card__media" controls preload="metadata">
        <source src={item.mediaUrl} />
        Your browser does not support this news video.
      </video>
    );
  }

  if (item.mediaType === "photo") {
    return (
      <img
        className="public-news-card__media"
        src={item.mediaUrl}
        alt=""
        loading="lazy"
      />
    );
  }

  return null;
}

export function NewsPage() {
  const [news, setNews] = useState([]);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    document.title = "News | Discover Bible School Kaduna";
    const controller = new AbortController();

    loadPublishedNews({ signal: controller.signal })
      .then((items) => {
        setNews(items);
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <main className="public-news-shell">
      <header className="public-news-header">
        <div className="public-news-brand">
          <img src={dbsKadunaLogo} alt="DBS Kaduna" />
          <span aria-hidden="true" />
          <img src={voiceOfProphecyLogo} alt="Voice of Prophecy" />
        </div>
        <a href="/">
          <ArrowLeft aria-hidden="true" size={19} weight="bold" />
          Back to homepage
        </a>
      </header>

      <section className="public-news-hero">
        <span>
          <Newspaper aria-hidden="true" size={28} weight="duotone" />
        </span>
        <p>Discover Bible School, Kaduna</p>
        <h1>School News</h1>
        <small>Announcements, updates, photos, and videos from DBS Kaduna.</small>
      </section>

      <section className="public-news-feed" aria-live="polite">
        {status === "loading" && (
          <p className="public-news-state">Loading published news...</p>
        )}
        {status === "error" && (
          <p className="public-news-state public-news-state--error">
            News could not be loaded right now. Please try again later.
          </p>
        )}
        {status === "ready" && news.length === 0 && (
          <p className="public-news-state">
            No news has been published yet.
          </p>
        )}
        {status === "ready" &&
          news.map((item) => (
            <article className="public-news-card" key={item.id}>
              <NewsMedia item={item} />
              <div className="public-news-card__content">
                <p className="public-news-card__date">
                  <CalendarBlank aria-hidden="true" size={18} />
                  {formatPublishedDate(item.publishedAt)}
                </p>
                <h2>{item.title}</h2>
                <p className="public-news-card__body">{item.body}</p>
              </div>
            </article>
          ))}
      </section>
    </main>
  );
}
