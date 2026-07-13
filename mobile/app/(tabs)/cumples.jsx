import { useLocalSearchParams, useRouter } from "expo-router";
import { Cumpleanios } from "../../features/cumples";

export default function CumplesScreen() {
  const { openFestejo } = useLocalSearchParams();
  const router = useRouter();
  return (
    <Cumpleanios
      openFestejoId={openFestejo || null}
      onClearOpenFestejo={() => router.setParams({ openFestejo: "" })}
    />
  );
}
