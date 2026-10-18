import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PLATFORM_LABELS, type MusicTrack } from "@retrodesk/shared";
import { FilePick } from "../ui";
import { ProviderPlayer } from "./ProviderPlayer";
import { classifyPastedUrl, type PastedSource } from "./sourceClassifier";

type TrackSource = MusicTrack["source"];

const urlOf = (source: TrackSource): string => {
  const url = source.kind === "audioUrl" || source.kind === "externalLink" ? source.url : source.kind === "providerEmbed" ? source.originalUrl || source.canonicalUrl : "";
  return url === "https://" ? "" : url;
};

type Props = {
  track: MusicTrack;
  windowId: string;
  /** Replaces the track's source (stops any preview first); `key` coalesces typing into one undo step. */
  patchSource: (source: TrackSource, key?: string) => void;
  uploadAudio: (file: File) => void;
  onOpenOriginal: () => void;
  resourceName: (type: Extract<TrackSource, { kind: "providerEmbed" }>["resourceType"]) => string;
};

/**
 * One place to put a track's source. The author pastes a link (or uploads a file) and Retro works out what it is:
 * a supported platform link becomes the official player (shown as a preview with its source), a direct audio file plays
 * natively, anything else — web pages, video files, unsupported platforms — is kept as an external link with the reason.
 * The author can always choose the external link instead of the player. Nothing here loads a third party; the player
 * preview is the same click-to-load card visitors get.
 */
export function TrackSourceField({ track, windowId, patchSource, uploadAudio, onOpenOriginal, resourceName }: Props) {
  const { t: tr } = useTranslation("music");
  const inputId = useId();
  // Text that is not yet a usable URL (still being typed) stays in the field without being saved over the last good source.
  const [pending, setPending] = useState<string | null>(null);
  // The author chose the external link for this embeddable URL; keeps the choice until they paste something different.
  const [externalFor, setExternalFor] = useState<string | null>(null);

  // The source can change under us (upload, undo/redo, another edit). Text that was only ever typed here and never saved
  // must not outlive that: drop it and any "choose external" memory, so the field always reflects the real source.
  const lastSource = useRef(track.source);
  useEffect(() => {
    if (lastSource.current === track.source) return;
    lastSource.current = track.source;
    setPending(null);
    setExternalFor(null);
  }, [track.source]);

  const stored = urlOf(track.source);
  const value = pending ?? stored;
  const decision: PastedSource = classifyPastedUrl(pending ?? stored);

  const commit = (raw: string) => {
    const result = classifyPastedUrl(raw);
    const key = `music-source-${track.id}`;
    if (result.type === "invalid") { setPending(raw); return; }
    setPending(null);
    if (result.type === "empty") { patchSource({ kind: "audioUrl", url: "https://" }, key); return; }
    if (result.type === "embed") {
      if (externalFor !== null && externalFor === raw.trim()) patchSource({ kind: "externalLink", url: raw.trim() }, key);
      else { setExternalFor(null); patchSource(result.source, key); }
      return;
    }
    setExternalFor(null);
    patchSource(result.type === "audio-file" ? { kind: "audioUrl", url: result.url } : { kind: "externalLink", url: result.url }, key);
  };

  const useExternal = () => { setExternalFor(stored); patchSource({ kind: "externalLink", url: stored }, `music-source-${track.id}`); };
  const usePlayer = () => { const embed = classifyPastedUrl(stored); if (embed.type === "embed") { setExternalFor(null); patchSource(embed.source, `music-source-${track.id}`); } };

  const embedSource = track.source.kind === "providerEmbed" ? track.source : null;
  const offerPlayer = (track.source.kind === "externalLink" || track.source.kind === "audioUrl") && decision.type === "embed";
  // Data saved before this field existed can hold a web page or video file as an "audio file": offer the honest fix.
  const offerExternal = track.source.kind === "audioUrl" && (decision.type === "embed" || decision.type === "web-page" || decision.type === "video-file");

  const explanation = (() => {
    if (pending !== null || decision.type === "invalid") {
      const reason = decision.type === "invalid" ? decision.reason : "not-url";
      return reason === "credentials" ? tr("music.source.invalidCredentials") : reason === "port" ? tr("music.source.invalidPort") : reason === "too-long" ? tr("music.source.invalidTooLong") : tr("music.source.invalid");
    }
    if (track.source.kind === "uploadedAudio") return tr("music.source.uploaded");
    switch (decision.type) {
      case "embed":
        if (embedSource) return tr("music.source.recognizedEmbed", { platform: decision.platformLabel, resource: resourceName(decision.source.resourceType) });
        return track.source.kind === "audioUrl" ? tr("music.source.wasAudioPlatform", { platform: decision.platformLabel }) : tr("music.source.canEmbed", { platform: decision.platformLabel });
      case "audio-file": return tr("music.source.recognizedAudio");
      case "video-file": return track.source.kind === "audioUrl" ? tr("music.source.savedAudioNotAudio") : tr("music.source.recognizedVideoFile");
      case "web-page": {
        if (track.source.kind === "audioUrl") return tr("music.source.savedAudioNotAudio");
        const platform = decision.platformLabel ?? "";
        if (decision.reason === "short-link") return tr("music.source.reasonShortLink", { platform });
        if (decision.reason === "unsupported-resource") return tr("music.source.reasonUnsupportedResource", { platform });
        if (decision.reason === "unsupported-platform") return tr("music.source.reasonUnsupportedPlatform", { platform });
        return tr("music.source.recognizedPage");
      }
      default: return null;
    }
  })();
  const invalid = pending !== null || decision.type === "invalid";

  return (
    <div className="music-source-field" data-source-kind={track.source.kind}>
      <div className="music-source-row">
        <label htmlFor={inputId}><span>{tr("music.source.label")}</span></label>
        <div className="music-source-inputs">
          <input
            id={inputId}
            className="w98-input"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={value}
            placeholder={tr("music.source.placeholder")}
            aria-invalid={invalid}
            aria-describedby={`${inputId}-note`}
            onChange={(event) => commit(event.target.value)}
          />
          <FilePick className="w98-btn" accept="audio/mpeg,audio/ogg,audio/wav,.mp3,.ogg,.wav" onFiles={(files) => files[0] && uploadAudio(files[0])}>{track.source.kind === "uploadedAudio" ? tr("music.replaceAudioFile") : tr("music.uploadAudio")}</FilePick>
        </div>
      </div>
      <p id={`${inputId}-note`} className={`w98-hint music-source-explain${invalid ? " bad" : ""}`} role={invalid ? "alert" : "status"} data-testid="source-explanation">
        {explanation ?? tr("music.source.auto")}
      </p>

      {track.source.kind === "uploadedAudio" ? <p className="w98-hint">{tr("music.theFileIsStoredIn")}</p> : null}

      {embedSource ? (
        <>
          <p className="w98-hint music-embed-summary">{tr("music.source.sourceLine", { platform: PLATFORM_LABELS[embedSource.provider] })} · {tr("music.source.playerNote")}</p>
          <ProviderPlayer source={embedSource} title={track.title} windowId={windowId} trackId={track.id} onOpenOriginal={onOpenOriginal} />
          <button type="button" className="w98-btn small" style={{ alignSelf: "flex-start" }} onClick={useExternal}>{tr("music.source.useExternal")}</button>
        </>
      ) : null}
      {offerPlayer || offerExternal ? (
        <div className="music-notice-actions">
          {offerPlayer ? <button type="button" className="w98-btn small primary" onClick={usePlayer}>{tr("music.source.usePlayer")}</button> : null}
          {offerExternal ? <button type="button" className="w98-btn small" onClick={useExternal}>{tr("music.source.useExternal")}</button> : null}
        </div>
      ) : null}
    </div>
  );
}
