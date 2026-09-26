import CatchApp from "./components/CatchApp";

// CatchApp is a client component, but it only touches browser APIs (speech,
// MediaRecorder, IndexedDB) inside effects and handlers, so it server-renders
// safely without `ssr: false`.
export default function Page() {
  return <CatchApp />;
}
