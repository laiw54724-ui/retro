import { AvatarImage } from "../../../components/AvatarImage";
import { SafeImg } from "../ui";
import type { ModuleProps } from "../types";

// Placeholder until the full v2 Instagram module lands.
export function LegacyIgView({ window }: ModuleProps<"instagram">) {
  const { profile, images } = window.content;
  return (
    <div className="ig-profile">
      <div className="ig-head">
        <div className="avatar">{profile.avatar ? <AvatarImage src={profile.avatar} crop={profile.avatarCrop} /> : null}</div>
        <div>
          <strong>{profile.username}</strong>
          <div className="ig-counts"><span>{images.length} posts</span><span>{profile.followers} followers</span><span>{profile.following} following</span></div>
        </div>
      </div>
      <p>{profile.name} {profile.alt}</p>
      <p className="preline">{profile.bio}</p>
      <div className="ig-grid">{images.map((image) => <div key={image.id}>{image.src ? <SafeImg src={image.src} alt={image.title} compact style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}</div>)}</div>
    </div>
  );
}
