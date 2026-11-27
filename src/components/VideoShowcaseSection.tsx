import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  FileText,
  Maximize2,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Lang, SUPPORTED_LANGUAGES } from '../data/content';
import {
  getDemoById,
  getSubtitleTrack,
  getVoiceOverLabel,
  VIDEO_DEMOS,
  VIDEO_LANGUAGES,
  VIDEO_PRIMARY_LANGUAGE,
  VideoDemo,
} from '../data/videoShowcase';
import { AppView } from '../types/platform';

interface VideoShowcaseSectionProps {
  lang: Lang;
  onChangeLang: (lang: Lang) => void;
  onNavigate: (view: AppView) => void;
}

const DEMO_CTA: Record<VideoDemo['id'], { label: string; view: AppView }> = {
  customer: { label: 'Explore customer storefronts', view: 'marketplace' },
  'shop-owner': { label: 'Try the interactive platform demo', view: 'demo' },
  'delivery-partner': { label: 'Open delivery partner portal', view: 'dashboards' },
};

export function VideoShowcaseSection({ lang, onChangeLang, onNavigate }: VideoShowcaseSectionProps) {
  const [selectedId, setSelectedId] = useState<VideoDemo['id']>('customer');
  const [selectedLang, setSelectedLang] = useState<Lang>(lang);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [showScript, setShowScript] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const demo = useMemo(() => getDemoById(selectedId), [selectedId]);
  const videoReady = Boolean(demo.videoSrc);
  const subtitleTrack = getSubtitleTrack(demo, selectedLang);
  const languageMeta = SUPPORTED_LANGUAGES.find((item) => item.code === selectedLang);

  useEffect(() => setSelectedLang(lang), [lang]);
  useEffect(() => {
    setIsPlaying(false);
    setShowScript(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [selectedId, selectedLang]);

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video || !videoReady) return;
    if (video.paused) {
      await video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video || !videoReady) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const toggleFullscreen = async () => {
    const stage = stageRef.current;
    if (!stage || !videoReady) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await stage.requestFullscreen();
  };

  const changeVideoLanguage = (next: Lang) => {
    setSelectedLang(next);
    onChangeLang(next);
  };

  const cta = DEMO_CTA[demo.id];
  const narration = demo.narration[selectedLang] || demo.narration.en;

  return (
    <section
      id="watch-how-it-works"
      aria-labelledby="watch-how-title"
      className="py-16 md:py-24 border-b border-[#1D1D26] bg-[#08080A] scroll-mt-24"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="max-w-3xl mb-10">
          <p className="text-xs font-medium text-[#D4AF37] mb-2">Plain-Language Demonstrations</p>
          <h2 id="watch-how-title" className="font-luxury text-2xl md:text-4xl font-bold text-white text-balance">
            VIJAY VISUALS — WATCH HOW IT WORKS
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[#A3A3B5]">
            See how customers order, shop owners manage orders, and delivery partners verify each handover.
            The written workflow scripts and captions are ready; video production is still being prepared.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 mb-6" role="group" aria-label="Choose a demo">
          {VIDEO_DEMOS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={item.id === selectedId}
              onClick={() => setSelectedId(item.id)}
              className={`min-h-11 rounded-md border px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 focus-visible:ring-offset-[#08080A] ${
                item.id === selectedId
                  ? 'border-[#D4AF37] bg-[#D4AF37] text-[#08080A]'
                  : 'border-[#2A2A38] bg-[#0E0E15] text-[#D8D8E2] hover:border-[#D4AF37]/60'
              }`}
            >
              {item.title[selectedLang] || item.title.en}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)] gap-6">
          <div
            ref={stageRef}
            className="relative overflow-hidden rounded-xl border border-[#282836] bg-[#0D0D13] aspect-video"
          >
            {videoReady ? (
              <video
                ref={videoRef}
                className="h-full w-full object-contain bg-black"
                controls
                playsInline
                preload="metadata"
                poster={demo.posterImage}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
              >
                <source src={demo.videoSrc ?? undefined} type="video/mp4" />
                {captionsOn && (
                  <track
                    kind="captions"
                    src={subtitleTrack.src}
                    srcLang={subtitleTrack.srcLang}
                    label={subtitleTrack.label}
                    default
                  />
                )}
              </video>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center px-5 py-6 text-center">
                <img
                  src={demo.posterImage}
                  alt="Official VIJAY VISUALS logo used as the demo poster"
                  width={1024}
                  height={1024}
                  className="h-16 w-16 object-contain mb-4"
                  loading="lazy"
                  decoding="async"
                />
                <p className="font-luxury text-lg md:text-2xl font-semibold text-white">
                  {demo.title[selectedLang] || demo.title.en}
                </p>
                {demo.status === 'preparing' ? (
                  <p className="mt-2 text-xs md:text-sm text-[#ECC86A]" role="status">
                    Video being prepared — script, storyboard and {languageMeta?.englishName || selectedLang} captions are ready.
                  </p>
                ) : (
                  <p className="mt-2 text-xs md:text-sm text-[#ECC86A]" role="status">
                    Video source not published — script, storyboard and {languageMeta?.englishName || selectedLang} captions are ready.
                  </p>
                )}
                {demo.status === 'preparing' && (
                  <p className="mt-2 max-w-md text-[11px] leading-relaxed text-[#8E8EA2]">
                    No MP4 has been generated. AI scenes, when produced, will be labelled “Illustrative scene — not a product screen”.
                    Product screens will be shown from Preview demo data only.
                  </p>
                )}
              </div>
            )}

            <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 bg-gradient-to-t from-black/90 to-transparent px-3 py-3">
              <button
                type="button"
                aria-label={isPlaying ? 'Pause demo video — Play / Pause' : 'Play demo video — Play / Pause'}
                title={videoReady ? undefined : 'Playback starts when the video is ready'}
                disabled={!videoReady}
                onClick={togglePlay}
                className="inline-flex min-h-11 items-center gap-1.5 rounded border border-[#4A4A5C] bg-black/60 px-3 text-[11px] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 focus-visible:ring-offset-[#08080A] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                Play / Pause
              </button>
              <button
                type="button"
                aria-label={muted ? 'Unmute demo video — Volume' : 'Mute demo video — Volume'}
                title={videoReady ? undefined : 'Audio starts when the video is ready'}
                disabled={!videoReady}
                onClick={toggleMute}
                className="inline-flex min-h-11 items-center gap-1.5 rounded border border-[#4A4A5C] bg-black/60 px-3 text-[11px] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 focus-visible:ring-offset-[#08080A] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                Volume
              </button>
              <button
                type="button"
                aria-label={`Toggle demo video captions — Captions ${captionsOn ? 'On' : 'Off'}`}
                aria-pressed={captionsOn}
                disabled={!videoReady}
                onClick={() => setCaptionsOn((value) => !value)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded border border-[#4A4A5C] bg-black/60 px-3 text-[11px] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 focus-visible:ring-offset-[#08080A] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FileText className="h-3.5 w-3.5" />
                Captions {captionsOn ? 'On' : 'Off'}
              </button>
              <button
                type="button"
                aria-label="Play demo video in full screen — Full screen"
                disabled={!videoReady}
                onClick={toggleFullscreen}
                className="inline-flex min-h-11 items-center gap-1.5 rounded border border-[#4A4A5C] bg-black/60 px-3 text-[11px] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 focus-visible:ring-offset-[#08080A] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                Full screen
              </button>
            </div>
          </div>

          <aside className="rounded-xl border border-[#282836] bg-[#0D0D13] p-5 space-y-4">
            <div>
              <label htmlFor="video-language-select" className="block text-[11px] text-[#8E8EA2] mb-1">
                subtitle language
              </label>
              <select
                id="video-language-select"
                aria-label="Select demo subtitle language"
                value={selectedLang}
                onChange={(event) => changeVideoLanguage(event.target.value as Lang)}
                className="min-h-11 w-full rounded-md border border-[#2A2A38] bg-[#09090D] px-3 text-xs text-[#ECC86A] focus:border-[#D4AF37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D0D13]"
              >
                {VIDEO_LANGUAGES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.nativeName} · {item.englishName}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-[11px] leading-relaxed text-[#8E8EA2]">
                {getVoiceOverLabel()}. Telugu is the primary production language.
              </p>
              {subtitleTrack.fellBackToEnglish && (
                <p className="mt-1 text-[11px] leading-relaxed text-[#ECC86A]" role="status">
                  Subtitles are unavailable in this language; showing verified English captions instead.
                </p>
              )}
            </div>

            <div className="border-t border-[#222230] pt-4">
              <p className="text-[11px] font-semibold text-white">{demo.audience}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[#A3A3B5]">
                {showScript ? narration.join(' ') : 'Open the written workflow script to read every narration line in this language.'}
              </p>
              <button
                type="button"
                aria-expanded={showScript}
                onClick={() => setShowScript((value) => !value)}
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md border border-[#D4AF37]/40 px-3 text-[11px] font-semibold text-[#ECC86A] hover:border-[#D4AF37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D0D13]"
              >
                <FileText className="h-3.5 w-3.5" />
                {showScript ? 'Hide written script' : 'Read written script'}
              </button>
            </div>

            <div className="border-t border-[#222230] pt-4 space-y-2">
              <p className="text-[11px] leading-relaxed text-[#8E8EA2]">
                Subtitle file: <code className="text-[#D8D8E2]">{subtitleTrack.src}</code>
              </p>
              <button
                type="button"
                onClick={() => onNavigate(cta.view)}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-gold-gradient px-4 text-[11px] font-semibold text-[#08080A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D0D13]"
              >
                {cta.label}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </aside>
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-[#78788E]">
          Honest production note: no real payment, payout, testimonial, rating, customer count, guaranteed delivery time,
          or guaranteed earning is shown. Customer-facing white-label storefronts never carry this platform showcase or branding.
          Default production language: {VIDEO_LANGUAGES.find((item) => item.code === VIDEO_PRIMARY_LANGUAGE)?.englishName}.
        </p>
      </div>
    </section>
  );
}
