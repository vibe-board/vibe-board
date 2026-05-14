import type { UnifiedConnection } from '@/lib/connections/types';
import type { SoundFile } from 'shared/types';

export async function playNotificationSound(
  connection: UnifiedConnection,
  soundFile: SoundFile
): Promise<void> {
  const audio = new Audio();
  const response = await connection.fetch(`/api/sounds/${soundFile}`, {
    headers: { Accept: 'audio/wav' },
  });

  if (!response.ok) {
    throw new Error(`Failed to load notification sound: ${response.status}`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const cleanup = () => URL.revokeObjectURL(objectUrl);

  audio.src = objectUrl;
  audio.addEventListener('ended', cleanup, { once: true });
  audio.addEventListener('error', cleanup, { once: true });

  try {
    await audio.play();
  } catch (error) {
    cleanup();
    throw error;
  }
}
