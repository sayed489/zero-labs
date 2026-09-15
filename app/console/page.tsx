import { ConsoleFrame } from '@/components/console-frame'

export default async function ConsolePage({ searchParams }: { searchParams: Promise<{ device?: string }> }) {
  const { device = '' } = await searchParams
  return <ConsoleFrame requestedDeviceId={device} />
}
