import { PairingScreen } from '@/components/pairing-screen'

export default async function PairPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code = '' } = await searchParams
  return <PairingScreen initialCode={code} />
}
