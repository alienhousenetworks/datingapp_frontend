import React, { useState, useEffect, useRef } from "react";
import { interactionAPI, moderationAPI } from "../api";
import { resolveThemeStyles } from "../utils/themeCatalog";
import { getGenderLabel, getSexualityLabel, getMoodLabel } from "../utils/profileLabels";
import { LAPTOP_MIN_WIDTH } from "../constants/breakpoints";
import feedCss from "../styles/FeedProfileItem.module.css";

const DM_ERROR_MESSAGES = {
  ineligible_dm: "You're not eligible to message this user based on profile settings.",
  quota_exceeded: "Daily direct message limit reached (15). Try again tomorrow.",
  duplicate_request: "You already have a pending request with this user.",
  missing_attributes: "Set your gender and sexuality in profile settings first.",
  blocked: "You are blocked by this user.",
  profile_not_found: "User profile not found.",
};

const carouselStyles = {
  carousel: {
    flex: 1,
    display: "flex",
    overflowX: "auto",
    scrollSnapType: "x mandatory",
    WebkitOverflowScrolling: "touch",
    scrollbarWidth: "none",
    height: "100%",
  },
  slide: {
    minWidth: "100%",
    flexShrink: 0,
    scrollSnapAlign: "start",
    display: "flex",
    flexDirection: "column",
    position: "relative",
    height: "100%",
    overflowY: "auto",
    overflowX: "hidden",
    paddingBottom: "100px", // desktop: space for bottom action
  }
};

/** Mobile-only layout: vertical feed scroll + tap/swipe photos in hero strip only */
const MobileFeedCard = ({ profile, handleLike, setFullScreenImage, themeStyles, liked }) => {
  const bg = themeStyles.cardStyle.background;
  const images = profile.images || [];
  const [photoIdx, setPhotoIdx] = useState(0);
  const scrollRef = useRef(null);

  const goPhoto = (step) => {
    let next = photoIdx + step;
    if (next < 0) next = images.length - 1;
    if (next >= images.length) next = 0;
    
    if (scrollRef.current) {
      const width = scrollRef.current.offsetWidth;
      scrollRef.current.scrollTo({ left: next * width, behavior: 'smooth' });
    }
  };

  const moodLabel = getMoodLabel(profile);

  const touchStartRef = useRef(null);
  
  const handlePointerDown = (clientX) => {
    if (images.length <= 1) return;
    touchStartRef.current = clientX;
  };
  
  const handlePointerUp = (clientX) => {
    if (images.length <= 1 || touchStartRef.current == null) return;
    const diff = clientX - touchStartRef.current;
    if (diff > 40) goPhoto(-1);
    else if (diff < -40) goPhoto(1);
    touchStartRef.current = null;
  };

  return (
    <div className={feedCss.card} style={{ ...styles.container, background: bg, backgroundSize: "cover", backgroundPosition: "center", marginBottom: 0 }}>
      <div className={feedCss.mobileCard}>
        <div className={feedCss.mobilePolaroidWrap}>
          {/* Background photo (if exists) */}
          {images.length > 1 && (
            <div className={feedCss.mobilePolaroidBack}>
              <img src={images[1].image_url} alt="" />
            </div>
          )}
          
          {/* Main photo (Carousel) */}
          <div className={feedCss.mobilePolaroidFront}>
            {images.length > 0 ? (
              <div 
                ref={scrollRef}
                className={feedCss.mobileHeroScroll}
                onScroll={(e) => {
                  const scrollLeft = e.target.scrollLeft;
                  const width = e.target.offsetWidth;
                  const index = Math.round(scrollLeft / width);
                  setPhotoIdx(index);
                }}
                onTouchStart={(e) => handlePointerDown(e.touches[0].clientX)}
                onTouchEnd={(e) => handlePointerUp(e.changedTouches[0].clientX)}
                onMouseDown={(e) => handlePointerDown(e.clientX)}
                onMouseUp={(e) => handlePointerUp(e.clientX)}
                onMouseLeave={(e) => {
                  if (touchStartRef.current !== null) {
                    handlePointerUp(e.clientX);
                  }
                }}
              >
                {images.map((img, i) => (
                  <div key={i} className={feedCss.mobileHeroSlide}>
                    <img
                      className={feedCss.mobileHeroImg}
                      src={img.image_url}
                      alt={profile.username ? `@${profile.username}` : "Unknown"}
                      onClick={(e) => {
                        // Prevent click if we dragged
                        if (touchStartRef.current !== null && Math.abs(e.clientX - touchStartRef.current) > 10) {
                          e.preventDefault();
                          return;
                        }
                        setFullScreenImage(img.image_url);
                      }}
                      style={{ pointerEvents: 'auto' }}
                      onError={(e) => { e.target.style.display = "none"; }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className={feedCss.mobileHeroPlaceholder}>
                {profile.username?.[0]?.toUpperCase() || "?"}
              </div>
            )}
            
            {/* Dots */}
            {images.length > 1 && (
              <div className={feedCss.mobileDots}>
                {images.map((_, i) => (
                  <span
                    key={i}
                    className={`${feedCss.mobileDot} ${i === photoIdx ? feedCss.mobileDotActive : ""}`}
                  />
                ))}
              </div>
            )}

            {/* Badges */}
            <div className={feedCss.mobileBadgeLeft}>
              <span className={feedCss.badgeEmoji}>{moodLabel ? "😊" : "😎"}</span>
            </div>
            <div className={feedCss.mobileBadgeRight}>
              <span className={feedCss.badgeEmoji}>🎵</span>
            </div>
          </div>
        </div>

        <div className={feedCss.mobileInfoCenter}>
          <h2 className={feedCss.mobileFunkyName}>
            {(profile.username ? `@${profile.username}` : "Unknown").toUpperCase()}, {profile.age} {profile.gender === 'female' ? 'F' : profile.gender === 'male' ? 'M' : ''}
          </h2>
          <div className={feedCss.mobileHandwrittenRow}>
            <span>{[profile.city, profile.distance_km != null ? `${profile.distance_km} KM` : null].filter(Boolean).join(", ")}</span>
            <span>{getSexualityLabel(profile)}</span>
            <span>75%</span>
          </div>
          {profile.bio && (
            <p className={feedCss.mobileHandwrittenBio}>
              {profile.bio}
            </p>
          )}
        </div>

        <div className={feedCss.mobileActionCenter}>
          <button 
            type="button" 
            className={feedCss.mobileGlowingHeart} 
            onClick={handleLike} 
            aria-label="Like"
            style={{ 
              background: liked ? "radial-gradient(circle at center, #8bd969 0%, #6ab04c 100%)" : "rgba(106, 176, 76, 0.4)",
              boxShadow: liked ? "0 0 24px rgba(139, 217, 105, 0.8)" : "0 0 16px rgba(139, 217, 105, 0.4)"
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill={liked ? "#fff" : "#8bd969"} stroke={liked ? "#fff" : "#8bd969"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
               <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

const PolaroidLayout = ({ profile, handleLike, setFullScreenImage, themeStyles, liked }) => {
  const bg = themeStyles.cardStyle.background;

  const renderOverviewSection = () => {
    const moodLabel = getMoodLabel(profile);
    return (
    <div className={feedCss.polaroidInner} style={polaroidStyles.inner}>
      <div style={polaroidStyles.imageContainer}>
        <div style={polaroidStyles.polaroidFrame}>
          {profile.images?.[0]?.image_url ? (
            <img
              src={profile.images[0].image_url}
              alt={profile.username ? `@${profile.username}` : "Unknown"}
              style={polaroidStyles.image}
              onClick={() => setFullScreenImage(profile.images[0].image_url)}
              onError={(e) => { e.target.style.display = "none"; }}
            />
          ) : (
            <div style={polaroidStyles.heroAvatar}>No Image</div>
          )}
          <div style={polaroidStyles.spotifyBadge}>
            <div style={polaroidStyles.spotifyText}>Favourite track</div>
            <div style={polaroidStyles.spotifyIcon}>🎵</div>
          </div>
        </div>
      </div>
      
      <div style={polaroidStyles.infoBox}>
        <h2 style={polaroidStyles.name}>{profile.username ? `@${profile.username}` : "Unknown"}</h2>
        <div style={polaroidStyles.metaTags}>
          <span style={polaroidStyles.tag}>{getGenderLabel(profile)}</span>
          <span style={polaroidStyles.tag}>{getSexualityLabel(profile)}</span>
        </div>
        <div style={polaroidStyles.subtext}>
          📍 {profile.distance_km} KM away • 🕒 {profile.last_seen || "Recently Active"}
        </div>
        
        {moodLabel && (
          <div style={polaroidStyles.moodBadge}>
            Mood: {moodLabel}
          </div>
        )}

        {profile.bio && (
          <p className={feedCss.bio} style={polaroidStyles.bio}>"{profile.bio}"</p>
        )}
      </div>

      <div className={feedCss.swipeHint} style={styles.swipeHint}>Swipe left for gallery ➡️</div>
    </div>
  );
  };

  const renderGallerySection = () => {
    const otherImages = profile.images?.slice(1) || [];
    return (
      <div style={polaroidStyles.innerDetails}>
        <h2 style={polaroidStyles.title}>Photo Gallery</h2>
        {otherImages.length > 0 ? (
          <div style={polaroidStyles.galleryGrid}>
            {otherImages.map((img, idx) => (
              <img
                key={idx}
                src={img.image_url}
                alt="gallery"
                style={polaroidStyles.galleryImage}
                onClick={() => setFullScreenImage(img.image_url)}
              />
            ))}
          </div>
        ) : (
          <div style={polaroidStyles.emptyGallery}>No other images</div>
        )}
        <div style={styles.swipeHint}>⬅️ Swipe left for details ➡️</div>
      </div>
    );
  };

  const renderDetailsSection = () => (
    <div style={polaroidStyles.innerDetails}>
      <h2 style={polaroidStyles.title}>About</h2>
      
      <div style={polaroidStyles.detailGrid}>
        <div style={polaroidStyles.detailItem}>
          <span style={polaroidStyles.detailLabel}>Age</span>
          <span style={polaroidStyles.detailValue}>{profile.age || "N/A"}</span>
        </div>
        <div style={polaroidStyles.detailItem}>
          <span style={polaroidStyles.detailLabel}>Height</span>
          <span style={polaroidStyles.detailValue}>{profile.height || "N/A"}</span>
        </div>
        <div style={polaroidStyles.detailItem}>
          <span style={polaroidStyles.detailLabel}>Location</span>
          <span style={polaroidStyles.detailValue}>{profile.city || "Unknown"}, {profile.country || "Unknown"}</span>
        </div>
      </div>

      <div style={polaroidStyles.turnOnsContainer}>
        <div style={polaroidStyles.turnOnsTitle}>Turn Ons</div>
        {profile.turn_ons_detail && profile.turn_ons_detail.length > 0 ? (
          <div style={polaroidStyles.turnOnsTags}>
            {profile.turn_ons_detail.map(t => (
              <span key={t.id} style={polaroidStyles.turnOnTag}>🔥 {t.name}</span>
            ))}
          </div>
        ) : (
          <div style={polaroidStyles.turnOnsTags}>
             <span style={polaroidStyles.turnOnTag}>No turn ons specified</span>
          </div>
        )}
      </div>

      <div style={styles.swipeHint}>⬅️ Swipe right to go back</div>
    </div>
  );

  return (
    <div className={feedCss.card} style={{ ...styles.container, background: bg }}>
      <div className={feedCss.carousel} style={carouselStyles.carousel}>
        <div className={feedCss.slide} style={carouselStyles.slide}>{renderOverviewSection()}</div>
        <div className={feedCss.slide} style={carouselStyles.slide}>{renderGallerySection()}</div>
        <div className={feedCss.slide} style={carouselStyles.slide}>{renderDetailsSection()}</div>
      </div>
      
      <div className={feedCss.bottomAction} style={polaroidStyles.bottomAction}>
        <button 
          className={feedCss.likeBtn} 
          style={{
            ...polaroidStyles.likeBtn,
            background: liked ? "rgba(255, 48, 64, 0.9)" : "rgba(160, 32, 240, 0.8)",
            boxShadow: liked ? "0 0 20px rgba(255, 48, 64, 0.6)" : "0 0 20px rgba(160,32,240,0.6)",
          }} 
          onClick={handleLike}
        >
          <span style={polaroidStyles.heartIcon}>{liked ? "❤️" : "♥"}</span>
        </button>
      </div>
    </div>
  );
};

const ElegantLayout = ({ profile, handleLike, setFullScreenImage, themeStyles, liked }) => {
  const bg = themeStyles.cardStyle.background;

  const renderOverviewSection = () => {
    const moodLabel = getMoodLabel(profile);
    return (
    <div className={feedCss.slideContent} style={elegantStyles.slideContent}>
      <div className={feedCss.imageSection} style={elegantStyles.imageSection}>
        {profile.images?.[0]?.image_url ? (
          <img
            src={profile.images[0].image_url}
            alt={profile.username ? `@${profile.username}` : "Unknown"}
            style={elegantStyles.image}
            onClick={() => setFullScreenImage(profile.images[0].image_url)}
            onError={(e) => { e.target.style.display = "none"; }}
          />
        ) : (
          <div style={polaroidStyles.heroAvatar}>No Image</div>
        )}
      </div>

      <div className={feedCss.overviewInfo} style={elegantStyles.overviewInfo}>
        <h2 className={feedCss.name} style={elegantStyles.name}>{profile.username ? `@${profile.username}` : "Unknown"}</h2>
        <div style={elegantStyles.metaRow}>
          <span>{getGenderLabel(profile)}</span>
          <span>•</span>
          <span>{getSexualityLabel(profile)}</span>
        </div>
        <div style={elegantStyles.subMetaRow}>
          📍 {profile.distance_km} KM away • 🕒 {profile.last_seen || "Recently Active"}
        </div>

        {moodLabel && (
          <div style={elegantStyles.moodBadge}>
            Mood: {moodLabel}
          </div>
        )}

        {profile.bio && (
          <div style={elegantStyles.whiteCard}>
            <p className={feedCss.bioText} style={elegantStyles.bioText}>"{profile.bio}"</p>
          </div>
        )}
      </div>

      <div className={feedCss.swipeHint} style={styles.swipeHint}>Swipe left for gallery ➡️</div>
    </div>
  );
  };

  const renderGallerySection = () => {
    const otherImages = profile.images?.slice(1) || [];
    return (
      <div style={elegantStyles.detailsSection}>
        <div style={elegantStyles.sectionTitle}>Gallery</div>
        {otherImages.length > 0 ? (
          <div style={elegantStyles.galleryGrid}>
            {otherImages.map((img, idx) => (
              <img
                key={idx}
                src={img.image_url}
                alt="gallery"
                style={elegantStyles.galleryImage}
                onClick={() => setFullScreenImage(img.image_url)}
              />
            ))}
          </div>
        ) : (
          <div style={elegantStyles.whiteCard}>
            <p style={{textAlign: "center", color: "#555"}}>No other images</p>
          </div>
        )}
        <div style={styles.swipeHint}>⬅️ Swipe left for details ➡️</div>
      </div>
    );
  };

  const renderDetailsSection = () => (
    <div style={elegantStyles.detailsSection}>
      <div style={elegantStyles.whiteCard}>
        <div style={elegantStyles.sectionTitle}>About</div>
        <div style={elegantStyles.detailRow}>
          <strong>Age:</strong> {profile.age || "N/A"}
        </div>
        <div style={elegantStyles.detailRow}>
          <strong>Height:</strong> {profile.height || "N/A"}
        </div>
        <div style={elegantStyles.detailRow}>
          <strong>Location:</strong> {profile.city || "Unknown"}, {profile.country || "Unknown"}
        </div>
      </div>

      <div style={elegantStyles.whiteCard}>
        <div style={elegantStyles.sectionTitle}>Turn Ons</div>
        {profile.turn_ons_detail && profile.turn_ons_detail.length > 0 ? (
          <div style={elegantStyles.tags}>
            {profile.turn_ons_detail.map(t => (
              <span key={t.id} style={elegantStyles.tag}>{t.name}</span>
            ))}
          </div>
        ) : (
          <div style={elegantStyles.tags}>
             <span style={elegantStyles.tag}>None</span>
          </div>
        )}
      </div>

      <div style={{ ...elegantStyles.whiteCard, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={elegantStyles.songImagePlaceholder}>🎵</div>
          <div>
            <div style={elegantStyles.songTitle}>Favorite Song</div>
            <div style={elegantStyles.songArtist}>Artist Name</div>
          </div>
        </div>
        <button style={elegantStyles.playBtn}>▶</button>
      </div>

      <div style={styles.swipeHint}>⬅️ Swipe right to go back</div>
    </div>
  );

  return (
    <div className={feedCss.card} style={{ ...styles.container, background: bg }}>
      <div className={feedCss.carousel} style={carouselStyles.carousel}>
        <div className={feedCss.slide} style={carouselStyles.slide}>{renderOverviewSection()}</div>
        <div className={feedCss.slide} style={carouselStyles.slide}>{renderGallerySection()}</div>
        <div className={feedCss.slide} style={carouselStyles.slide}>{renderDetailsSection()}</div>
      </div>
      
      <div className={feedCss.actionRow} style={elegantStyles.actionRow}>
        <button 
          className={feedCss.connectBtn} 
          style={{
            ...elegantStyles.connectBtn,
            background: liked ? "#ff3040" : "#000"
          }} 
          onClick={handleLike}
        >
          {liked ? "Liked!" : "Connect"}
        </button>
      </div>
    </div>
  );
};

const MinimalLayout = ({ profile, handleLike, setFullScreenImage, themeStyles, liked }) => {
  const bg = themeStyles.cardStyle.background;
  const moodLabel = getMoodLabel(profile);

  return (
    <div className={feedCss.card} style={{ ...styles.container, background: bg, display: "flex", flexDirection: "column", padding: 24, alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 140, height: 140, borderRadius: "50%", overflow: "hidden", border: `4px solid ${themeStyles.accent}`, marginBottom: 20 }}>
        <img
          src={profile.images?.[0]?.image_url}
          alt={profile.username ? `@${profile.username}` : "Unknown"}
          style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "pointer" }}
          onClick={() => setFullScreenImage(profile.images?.[0]?.image_url)}
          onError={(e) => { e.target.style.display = "none"; }}
        />
      </div>
      <h2 style={{ fontSize: 28, fontFamily: "var(--font-display)", color: "#fff", margin: "0 0 8px 0" }}>{profile.username ? `@${profile.username}` : "Unknown"}, {profile.age}</h2>
      <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginBottom: 16 }}>{profile.city}</div>
      <p style={{ textAlign: "center", color: "#fff", fontSize: 15, fontStyle: "italic", marginBottom: 24, padding: "0 20px" }}>
        {profile.bio ? `"${profile.bio}"` : "No bio provided."}
      </p>
      
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginBottom: 30 }}>
        <span style={polaroidStyles.tag}>{getGenderLabel(profile)}</span>
        <span style={polaroidStyles.tag}>{getSexualityLabel(profile)}</span>
        {moodLabel && <span style={polaroidStyles.tag}>Mood: {moodLabel}</span>}
      </div>

      <button 
        style={{
          width: 60, height: 60, borderRadius: "50%",
          background: liked ? "rgba(255, 48, 64, 0.9)" : "transparent",
          border: `2px solid ${liked ? "rgba(255, 48, 64, 0.9)" : "rgba(255,255,255,0.4)"}`,
          color: "#fff", fontSize: 24, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.2s"
        }}
        onClick={handleLike}
      >
        {liked ? "❤️" : "♡"}
      </button>
    </div>
  );
};

const GridGalleryLayout = ({ profile, handleLike, setFullScreenImage, themeStyles, liked }) => {
  const bg = themeStyles.cardStyle.background;
  const images = profile.images || [];

  return (
    <div className={feedCss.card} style={{ ...styles.container, background: bg, padding: 16, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16, height: 280, flexShrink: 0 }}>
        {images.slice(0, 4).map((img, i) => (
          <div key={i} style={{ borderRadius: 12, overflow: "hidden", background: "rgba(0,0,0,0.2)" }}>
            <img 
              src={img.image_url} 
              alt="Gallery" 
              style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "pointer" }} 
              onClick={() => setFullScreenImage(img.image_url)}
            />
          </div>
        ))}
        {images.length === 0 && <div style={{ gridColumn: "span 2", textAlign: "center", color: "#fff", padding: 20 }}>No images</div>}
      </div>

      <div style={{ flex: 1, overflowY: "auto", color: "#fff", paddingBottom: 60 }}>
        <h2 style={{ fontSize: 26, fontFamily: "var(--font-display)", margin: "0 0 4px 0" }}>{profile.username ? `@${profile.username}` : "Unknown"}, {profile.age}</h2>
        <div style={{ color: themeStyles.accent, fontSize: 13, fontWeight: "bold", marginBottom: 12 }}>{profile.city} • {profile.distance_km} KM away</div>
        <p style={{ fontSize: 14, lineHeight: 1.5, background: "rgba(0,0,0,0.3)", padding: 16, borderRadius: 12, marginBottom: 16 }}>
          {profile.bio || "This person hasn't written a bio yet."}
        </p>
      </div>

      <button 
        style={{
          position: "absolute", bottom: 16, right: 16,
          padding: "12px 24px", borderRadius: 24,
          background: liked ? "#ff3040" : themeStyles.accent,
          border: "none", color: "#fff", fontSize: 14, fontWeight: "bold", cursor: "pointer",
          boxShadow: `0 4px 12px ${themeStyles.accent}66`
        }}
        onClick={handleLike}
      >
        {liked ? "Matched ❤️" : "Send Like"}
      </button>
    </div>
  );
};

const ImmersiveLayout = ({ profile, handleLike, setFullScreenImage, themeStyles, liked }) => {
  const primaryImg = profile.images?.[0]?.image_url;
  
  return (
    <div className={feedCss.card} style={{ ...styles.container, background: "#000", position: "relative" }}>
      {primaryImg ? (
        <img 
          src={primaryImg} 
          alt={profile.username ? `@${profile.username}` : "Unknown"} 
          style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", top: 0, left: 0 }}
          onClick={() => setFullScreenImage(primaryImg)}
        />
      ) : (
        <div style={{ width: "100%", height: "100%", position: "absolute", background: themeStyles.cardStyle.background }}></div>
      )}
      
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 50%, transparent 100%)", padding: "100px 24px 24px 24px", color: "#fff", pointerEvents: "none" }}>
        <h2 style={{ fontSize: 32, fontFamily: "var(--font-display)", margin: "0 0 4px 0", textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}>
          {profile.username ? `@${profile.username}` : "Unknown"}, {profile.age}
        </h2>
        <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 16 }}>
          {profile.city} • {getGenderLabel(profile)}
        </div>
        {profile.bio && <p style={{ fontSize: 15, lineHeight: 1.4, margin: "0 0 16px 0", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{profile.bio}</p>}
      </div>

      <button 
        style={{
          position: "absolute", bottom: 24, right: 24,
          width: 56, height: 56, borderRadius: "50%",
          background: liked ? "#ff3040" : "#fff",
          border: "none", color: liked ? "#fff" : "#000", fontSize: 24, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)", zIndex: 10, pointerEvents: "auto"
        }}
        onClick={handleLike}
      >
        {liked ? "❤️" : "♥"}
      </button>
    </div>
  );
};

export default function FeedProfileItem({ profile, onLike, isPreview = false }) {
  const [liked, setLiked] = useState(profile?.is_liked || false);

  const [showDirectRequestModal, setShowDirectRequestModal] = useState(false);
  const [directRequestMessage, setDirectRequestMessage] = useState("");
  const [sendingDirectRequest, setSendingDirectRequest] = useState(false);

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("SPAM");
  const [reportDescription, setReportDescription] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);

  const [fullScreenImage, setFullScreenImage] = useState(null);
  const [isMobileFeed, setIsMobileFeed] = useState(
    () => typeof window !== "undefined" && window.innerWidth < LAPTOP_MIN_WIDTH
  );

  useEffect(() => {
    const onResize = () => setIsMobileFeed(window.innerWidth < LAPTOP_MIN_WIDTH);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!profile) return null;

  const themeStyles = resolveThemeStyles(profile.theme);
  // Map Flutter premium layout IDs (L01–L05) to web card shells
  const layoutCode = (themeStyles.layoutId || "").toLowerCase();
  let layoutType = "polaroid"; // L01 Velvet Glass
  if (layoutCode === "l02" || layoutCode.includes("maison") || layoutCode.includes("elegant")) {
    layoutType = "elegant";
  } else if (layoutCode === "l04" || layoutCode.includes("atelier") || layoutCode.includes("minimal")) {
    layoutType = "minimal";
  } else if (layoutCode === "l05" || layoutCode.includes("runway") || layoutCode.includes("grid")) {
    layoutType = "grid";
  } else if (layoutCode === "l03" || layoutCode.includes("noir") || layoutCode.includes("immersive")) {
    layoutType = "immersive";
  }

  const handleLike = () => {
    if (isPreview) {
      alert("This is a preview!");
      return;
    }
    if (profile.is_liked || liked) {
      alert("Already liked");
      return;
    }
    setLiked(true);
    
    if (onLike) {
      setTimeout(async () => {
        try {
          await onLike(profile);
        } catch (err) {
          // Revert animation on failure
          setLiked(false);
        }
      }, 600);
    }
  };

  const handleSendDirectRequest = async () => {
    if (isPreview) {
      setShowDirectRequestModal(false);
      return;
    }
    if (!directRequestMessage.trim()) return;
    setSendingDirectRequest(true);
    try {
      const res = await interactionAPI.startConversation(profile.id, directRequestMessage.trim());
      if (res.error) {
        alert(DM_ERROR_MESSAGES[res.code] || res.error);
      } else {
        alert(`Direct request sent! Remaining today: ${res.count_remaining}`);
        setShowDirectRequestModal(false);
        setDirectRequestMessage("");
      }
    } catch (err) {
      const code = err.data?.code;
      alert(DM_ERROR_MESSAGES[code] || err.message || "Failed to send request.");
    } finally {
      setSendingDirectRequest(false);
    }
  };

  const handleSubmitReport = async () => {
    if (isPreview) {
      setShowReportModal(false);
      return;
    }
    if (reportReason === "OTHER" && !reportDescription.trim()) {
      alert("Please provide a description for the report");
      return;
    }
    setSubmittingReport(true);
    try {
      const res = await moderationAPI.submitReport({
        reportedUserId: profile.id,
        reason: reportReason,
        description: reportDescription.trim(),
        targetType: "USER_PROFILE",
        targetId: profile.id
      });
      alert(res.message || "Profile reported successfully.");
      setShowReportModal(false);
      setReportDescription("");
    } catch {
      alert("Failed to submit report");
    } finally {
      setSubmittingReport(false);
    }
  };

  return (
    <>
      {isMobileFeed && !isPreview ? (
        <MobileFeedCard
          profile={profile}
          handleLike={handleLike}
          setFullScreenImage={setFullScreenImage}
          themeStyles={themeStyles}
          liked={liked}
        />
      ) : layoutType === "minimal" ? (
        <MinimalLayout 
          profile={profile} 
          handleLike={handleLike} 
          setFullScreenImage={setFullScreenImage} 
          themeStyles={themeStyles} 
          liked={liked}
        />
      ) : layoutType === "grid" ? (
        <GridGalleryLayout 
          profile={profile} 
          handleLike={handleLike} 
          setFullScreenImage={setFullScreenImage} 
          themeStyles={themeStyles} 
          liked={liked}
        />
      ) : layoutType === "immersive" ? (
        <ImmersiveLayout 
          profile={profile} 
          handleLike={handleLike} 
          setFullScreenImage={setFullScreenImage} 
          themeStyles={themeStyles} 
          liked={liked}
        />
      ) : layoutType === "elegant" ? (
        <ElegantLayout 
          profile={profile} 
          handleLike={handleLike} 
          setFullScreenImage={setFullScreenImage} 
          themeStyles={themeStyles} 
          liked={liked}
        />
      ) : (
        <PolaroidLayout 
          profile={profile} 
          handleLike={handleLike} 
          setFullScreenImage={setFullScreenImage} 
          themeStyles={themeStyles} 
          liked={liked}
        />
      )}

      {fullScreenImage && (
        <div style={styles.fullScreenOverlay} onClick={() => setFullScreenImage(null)}>
          <button style={styles.fullScreenClose}>✕</button>
          <img src={fullScreenImage} alt="Fullscreen" style={styles.fullScreenImage} />
        </div>
      )}

      {/* Modals */}
      {showDirectRequestModal && (
        <>
          <div style={styles.modalBackdrop} onClick={() => setShowDirectRequestModal(false)} />
          <div style={styles.customModal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Send Direct Message 💬</h3>
              <button style={styles.modalCloseBtn} onClick={() => setShowDirectRequestModal(false)}>✕</button>
            </div>
            <textarea
              style={styles.customTextarea}
              value={directRequestMessage}
              onChange={(e) => setDirectRequestMessage(e.target.value)}
              placeholder="Write a charming introductory message..."
              rows={4}
            />
            <button
              style={{ ...styles.modalSubmitBtn, opacity: sendingDirectRequest || !directRequestMessage.trim() ? 0.6 : 1 }}
              onClick={handleSendDirectRequest}
              disabled={sendingDirectRequest || !directRequestMessage.trim()}
            >
              {sendingDirectRequest ? "Sending..." : "Send Request"}
            </button>
          </div>
        </>
      )}

      {showReportModal && (
        <>
          <div style={styles.modalBackdrop} onClick={() => setShowReportModal(false)} />
          <div style={styles.customModal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Report Profile ⚑</h3>
              <button style={styles.modalCloseBtn} onClick={() => setShowReportModal(false)}>✕</button>
            </div>
            <label style={styles.customLabel}>Reason</label>
            <select
              style={styles.customSelect}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
            >
              <option value="SPAM">Spam</option>
              <option value="HARASSMENT">Harassment</option>
              <option value="FAKE_PROFILE">Fake Profile</option>
              <option value="OTHER">Other (specify below)</option>
            </select>
            <label style={styles.customLabel}>Description</label>
            <textarea
              style={styles.customTextarea}
              value={reportDescription}
              onChange={(e) => setReportDescription(e.target.value)}
              placeholder="Provide more context..."
              rows={3}
            />
            <button
              style={{ ...styles.modalSubmitBtn, background: "#EF4444", opacity: submittingReport ? 0.6 : 1 }}
              onClick={handleSubmitReport}
              disabled={submittingReport}
            >
              {submittingReport ? "Submitting..." : "Submit Report"}
            </button>
          </div>
        </>
      )}
    </>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    maxWidth: 470,
    margin: "0 auto",
    height: "calc(100vh - 120px)",
    minHeight: 650,
    maxHeight: 1000,
    borderRadius: 24,
    border: "0.5px solid var(--dark-600)",
    overflow: "hidden",
    position: "relative",
    scrollSnapAlign: "start",
    marginBottom: 24,
    boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
    scrollbarWidth: "none",
    backgroundSize: "cover",
    backgroundPosition: "center",
  },
  swipeHint: {
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    marginTop: 20,
    fontWeight: 600,
    textAlign: "center",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    width: "100%",
  },
  fullScreenOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.95)",
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  fullScreenClose: {
    position: "absolute",
    top: 20,
    right: 20,
    background: "rgba(255,255,255,0.2)",
    color: "white",
    border: "none",
    width: 40,
    height: 40,
    borderRadius: "50%",
    fontSize: 20,
    cursor: "pointer",
    zIndex: 1001,
  },
  fullScreenImage: {
    maxWidth: "100vw",
    maxHeight: "100vh",
    objectFit: "contain",
  },
  modalBackdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, backdropFilter: "blur(2px)" },
  customModal: { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "90%", maxWidth: 400, background: "var(--dark-800)", border: "0.5px solid var(--dark-600)", borderRadius: 20, padding: "24px", zIndex: 201 },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--white)", margin: 0 },
  modalCloseBtn: { background: "none", border: "none", color: "var(--dark-300)", fontSize: 16, cursor: "pointer" },
  customTextarea: { width: "100%", borderRadius: 10, border: "0.5px solid var(--dark-500)", background: "var(--dark-700)", fontSize: 13, padding: "10px 14px", color: "var(--white)", outline: "none", resize: "none", lineHeight: 1.55, marginBottom: 16, boxSizing: "border-box" },
  customSelect: { width: "100%", height: 38, borderRadius: 10, border: "0.5px solid var(--dark-500)", background: "var(--dark-700)", fontSize: 13, padding: "0 10px", color: "var(--white)", outline: "none", marginBottom: 16, boxSizing: "border-box" },
  customLabel: { display: "block", fontSize: 10, fontWeight: 600, color: "var(--dark-300)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6, fontFamily: "var(--font-display)" },
  modalSubmitBtn: { width: "100%", height: 40, borderRadius: 20, background: "var(--pink)", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px rgba(255,31,107,0.3)" },
};

const polaroidStyles = {
  inner: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "20px",
    paddingBottom: "80px",
    width: "100%",
  },
  innerDetails: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "20px",
    width: "100%",
    color: "#fff",
    textShadow: "1px 1px 3px rgba(0,0,0,0.6)"
  },
  title: {
    fontFamily: "'Bungee', sans-serif",
    fontSize: "24px",
    color: "#FFD700",
    marginBottom: "20px",
    textShadow: "2px 2px 4px rgba(0,0,0,0.6)"
  },
  infoBox: {
    width: "100%",
    textAlign: "center",
    marginTop: "10px",
    textShadow: "1px 1px 3px rgba(0,0,0,0.6)",
    color: "#fff"
  },
  metaTags: {
    display: "flex",
    justifyContent: "center",
    gap: "10px",
    marginBottom: "10px"
  },
  tag: {
    background: "rgba(255,255,255,0.2)",
    padding: "4px 10px",
    borderRadius: "15px",
    fontSize: "12px",
    fontWeight: "bold",
    border: "1px solid rgba(255,255,255,0.4)"
  },
  moodBadge: {
    background: "rgba(0, 0, 0, 0.5)",
    padding: "8px 16px",
    borderRadius: "20px",
    color: "#fff",
    fontFamily: "var(--font-display)",
    fontSize: "14px",
    fontWeight: "600",
    marginTop: "15px",
    display: "inline-block",
    backdropFilter: "blur(4px)",
    border: "1px solid rgba(255,255,255,0.2)"
  },
  imageContainer: {
    marginBottom: 10,
    position: "relative"
  },
  polaroidFrame: {
    background: "#fff",
    padding: "10px 10px 40px 10px",
    transform: "rotate(-2deg)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
    position: "relative",
    width: "260px"
  },
  image: {
    width: "100%",
    height: "280px",
    objectFit: "cover",
    cursor: "pointer"
  },
  heroAvatar: {
    width: "100%",
    height: "280px",
    background: "#f0f0f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "24px",
    fontWeight: "bold",
    color: "#888",
    fontFamily: "var(--font-display)"
  },
  galleryGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
    width: "100%"
  },
  galleryImage: {
    width: "100%",
    height: "150px",
    objectFit: "cover",
    borderRadius: "8px",
    cursor: "pointer",
    boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
    border: "2px solid rgba(255,255,255,0.8)"
  },
  emptyGallery: {
    padding: "40px 20px",
    background: "rgba(0,0,0,0.4)",
    borderRadius: "16px",
    width: "100%",
    textAlign: "center"
  },
  spotifyBadge: {
    position: "absolute",
    bottom: "-20px",
    right: "-20px",
    background: "#800080",
    borderRadius: "50%",
    width: "50px",
    height: "50px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
    border: "2px solid #fff",
    transform: "rotate(3deg)"
  },
  spotifyText: {
    position: "absolute",
    top: "-15px",
    fontSize: "9px",
    color: "#fff",
    whiteSpace: "nowrap",
    textShadow: "1px 1px 2px rgba(0,0,0,0.8)",
    fontFamily: "'Playfair Display', serif",
    transform: "rotate(-15deg)"
  },
  spotifyIcon: {
    fontSize: "20px"
  },
  name: {
    fontFamily: "'Bungee', sans-serif",
    fontSize: "24px",
    color: "#FFD700",
    margin: "0 0 10px 0",
    letterSpacing: "1px"
  },
  subtext: {
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    fontWeight: "bold",
    color: "#FFD700",
    marginTop: "10px"
  },
  bio: {
    fontFamily: "'Playfair Display', serif",
    fontSize: "15px",
    fontStyle: "italic",
    lineHeight: "1.4",
    marginTop: "15px"
  },
  detailGrid: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    width: "100%",
    background: "rgba(0,0,0,0.4)",
    padding: "20px",
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.2)"
  },
  detailItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
    paddingBottom: "8px"
  },
  detailLabel: {
    fontWeight: "bold",
    fontSize: "14px",
    color: "#ccc"
  },
  detailValue: {
    fontWeight: "600",
    fontSize: "15px",
    color: "#fff"
  },
  turnOnsContainer: {
    marginTop: "20px",
    width: "100%"
  },
  turnOnsTitle: {
    fontFamily: "'Bungee', sans-serif",
    fontSize: "18px",
    color: "#FFD700",
    marginBottom: "10px",
    textAlign: "center"
  },
  turnOnsTags: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    justifyContent: "center"
  },
  turnOnTag: {
    background: "rgba(255, 255, 255, 0.2)",
    border: "1px solid rgba(255, 255, 255, 0.4)",
    padding: "6px 12px",
    borderRadius: "20px",
    fontSize: "13px",
    fontWeight: "600"
  },
  bottomAction: {
    position: "absolute",
    bottom: "20px",
    left: "0",
    right: "0",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "20px",
    pointerEvents: "none",
  },
  likeBtn: {
    width: "70px",
    height: "70px",
    borderRadius: "50%",
    background: "radial-gradient(circle at center, #A020F0 0%, #6A0DAD 100%)",
    border: "3px solid rgba(255, 255, 255, 0.3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    boxShadow: "0 0 20px rgba(160, 32, 240, 0.6)",
    pointerEvents: "auto",
  },
  heartIcon: {
    fontSize: "32px",
    color: "#DDA0DD"
  }
};

const elegantStyles = {
  slideContent: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    paddingBottom: "20px"
  },
  overviewInfo: {
    padding: "10px 24px",
    width: "100%",
    color: "#fff",
    textAlign: "center",
    textShadow: "1px 1px 3px rgba(0,0,0,0.5)"
  },
  moodBadge: {
    background: "rgba(0, 0, 0, 0.5)",
    padding: "8px 16px",
    borderRadius: "20px",
    color: "#fff",
    fontFamily: "var(--font-display)",
    fontSize: "13px",
    fontWeight: "600",
    marginTop: "15px",
    display: "inline-block",
    backdropFilter: "blur(4px)",
    border: "1px solid rgba(255,255,255,0.2)"
  },
  imageSection: {
    width: "100%",
    height: "350px",
    padding: "20px",
    display: "flex",
    justifyContent: "center",
    flexShrink: 0
  },
  image: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    borderRadius: "16px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
    border: "2px solid rgba(255,255,255,0.8)"
  },
  galleryGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
    width: "100%"
  },
  galleryImage: {
    width: "100%",
    height: "140px",
    objectFit: "cover",
    borderRadius: "12px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
    cursor: "pointer"
  },
  detailsSection: {
    padding: "20px 24px 30px",
    color: "#fff",
    width: "100%"
  },
  name: {
    fontFamily: "'Playfair Display', serif",
    fontSize: "30px",
    fontWeight: "600",
    margin: "0 0 10px 0"
  },
  metaRow: {
    fontFamily: "var(--font-body)",
    fontSize: "14px",
    color: "#eee",
    display: "flex",
    justifyContent: "center",
    gap: "10px",
    marginBottom: "5px",
    fontWeight: "600"
  },
  subMetaRow: {
    fontSize: "13px",
    color: "#ddd",
    marginBottom: "10px"
  },
  whiteCard: {
    background: "rgba(255,255,255,0.95)",
    color: "#333",
    borderRadius: "16px",
    padding: "20px",
    marginTop: "20px",
    boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
    textShadow: "none"
  },
  detailRow: {
    display: "flex",
    justifyContent: "space-between",
    borderBottom: "1px solid #eee",
    paddingBottom: "8px",
    marginBottom: "10px",
    fontSize: "15px"
  },
  bioText: {
    fontFamily: "'Playfair Display', serif",
    fontStyle: "italic",
    fontSize: "15px",
    margin: 0,
    lineHeight: "1.5"
  },
  sectionTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: "18px",
    fontWeight: "bold",
    marginBottom: "15px",
    color: "#222"
  },
  tags: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px"
  },
  tag: {
    background: "#f0f0f0",
    padding: "6px 12px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "500",
    color: "#555",
    border: "1px solid #ddd"
  },
  songImagePlaceholder: {
    width: "48px",
    height: "48px",
    background: "#eee",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "20px"
  },
  songTitle: {
    fontSize: "15px",
    fontWeight: "bold",
    color: "#333"
  },
  songArtist: {
    fontSize: "13px",
    color: "#777"
  },
  playBtn: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    background: "#D478A7",
    border: "none",
    color: "#fff",
    fontSize: "16px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  actionRow: {
    position: "absolute",
    bottom: "20px",
    left: "20px",
    right: "20px",
    display: "flex",
    justifyContent: "center"
  },
  connectBtn: {
    flex: 1,
    background: "#D478A7",
    color: "#fff",
    border: "none",
    padding: "16px",
    borderRadius: "30px",
    fontSize: "18px",
    fontWeight: "bold",
    cursor: "pointer",
    boxShadow: "0 8px 20px rgba(212, 120, 167, 0.4)"
  }
};
