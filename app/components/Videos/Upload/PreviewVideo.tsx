import { PlayerComponent } from '@app/components/Player/Player';
import VideoJSPlayer from '@app/components/Player/VideoJSPlayer';
import React, { FC, useEffect, useState } from 'react';

interface PreviewVideoProps {
  video: File | null;
}

const PreviewVideo: FC<PreviewVideoProps> = ({ video }) => {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (video) {
      const objectUrl = URL.createObjectURL(video);
      setVideoUrl(objectUrl);

      // Clean up the object URL when the component unmounts or video changes
      return () => {
        URL.revokeObjectURL(objectUrl);
      };
    } else {
      setVideoUrl(null); // Reset the video URL if no video is provided
    }
  }, [video]); // Dependency on video prop

  return (
    <div className="flex w-full justify-center">
      {/* {videoUrl && (
        <VideoJSPlayer
          src={videoUrl}
          autoplay={false}
          controls={true}
          width={640}
          height={360}
          poster="/thumbnail.jpg"
          onPlay={() => console.log('Video started playing')}
          onPause={() => console.log('Video paused')}
          onEnded={() => console.log('Video ended')}
        />
      )} */}
      {videoUrl && (
          <video
            controls
            src={videoUrl} // Directly set src attribute
            className="mt-2 max-h-96 max-w-full"
          >
            Your browser does not support the video tag.
          </video>
          // <PlayerComponent src={[videoUrl]} title={video ? video.name : ''}/> 
      )}
    </div>
  );
};

export default PreviewVideo;
