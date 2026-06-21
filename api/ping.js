export default function handler(req, res) {
  res.status(200).json({
    status: "ok",
    project: "microassist-expert",
    time: new Date().toISOString(),
  });
}