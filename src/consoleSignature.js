// Console signature — authorship notice
export function showConsoleSignature() {
  const styleTitle = `
    font-size:18px;
    font-weight:bold;
    color:#6f2da8;
  `;

  const styleText = `
    font-size:12px;
    color:#333;
  `;

  console.log("%cMicroassist — Entrepreneurs Assistant", styleTitle);
  console.log(
    "%cPrototype développé par Olena Mykhalska — Cheffe de projet digital",
    styleText
  );
  console.log(
    "%cSi vous regardez ce code par curiosité : bienvenue 🙂",
    styleText
  );
  console.log(
    "%cMerci de respecter le travail de l’auteur.",
    styleText
  );
}