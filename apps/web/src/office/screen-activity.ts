import type { OfficeActivity } from "@agent-office/shared";

export const screenActivities = {
  working: "dashboard",
  typing: "code",
  reading: "document",
  researching: "search",
  monitoring: "terminal",
  delegating: "team",
  organizing: "folders",
  puzzled: "diagnostics",
  attention: "question",
  relaxing: "screensaver",
  celebrating: "success",
  away: "standby",
} satisfies Record<OfficeActivity, string>;

export function drawScreen(ctx: CanvasRenderingContext2D, activity: OfficeActivity, time: number) {
  ctx.fillStyle = "#182d36";
  ctx.fillRect(0, 0, 256, 144);
  ctx.fillStyle = "#31515d";
  ctx.fillRect(0, 0, 256, 18);
  ctx.fillStyle = "#e4e8de";
  ctx.font = "bold 11px Consolas, monospace";
  ctx.fillText(screenActivities[activity].toUpperCase(), 10, 13);
  const bar = (x: number, y: number, width: number, color = "#a9b7b7") => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width, 5);
  };
  switch (activity) {
    case "typing":
      for (let row = 0; row < 6; row++)
        bar(
          14 + (row % 3) * 12,
          30 + row * 16,
          row === 5 ? 15 + ((time * 45) % 130) : 65 + ((row * 29) % 130),
          row % 2 ? "#e5c982" : "#85bdb2",
        );
      if (Math.floor(time * 2) % 2 === 0) bar(30 + ((time * 45) % 130), 113, 5, "#ffffff");
      break;
    case "reading":
      ctx.fillStyle = "#e7e0ce";
      ctx.fillRect(45, 23, 166, 114);
      for (let row = 0; row < 9; row++) bar(56, 31 + row * 11, 100 + (row % 3) * 15, "#687d7c");
      ctx.fillStyle = "#cbb97c";
      ctx.fillRect(54, 30 + (Math.floor(time / 1.5) % 9) * 11, 3, 7);
      break;
    case "researching":
      bar(14, 28, 222, "#e7e0ce");
      for (let row = 0; row < 3; row++) {
        bar(18, 51 + row * 28, 90, "#85bdb2");
        bar(18, 61 + row * 28, 130);
      }
      ctx.strokeStyle = "#e5c982";
      ctx.strokeRect(10, 43 + (Math.floor(time / 2) % 3) * 28, 230, 24);
      break;
    case "monitoring":
      for (let row = 0; row < 5; row++)
        bar(12, 30 + row * 16, 50 + ((row * 31 + Math.floor(time) * 17) % 180), "#85bdb2");
      bar(12, 121, 230, "#31515d");
      bar(12 + (Math.sin(time * 2) + 1) * 90, 121, 45, "#e5c982");
      break;
    case "delegating":
      ctx.strokeStyle = "#85bdb2";
      ctx.beginPath();
      ctx.moveTo(128, 50);
      ctx.lineTo(128, 75);
      ctx.moveTo(42, 104);
      ctx.lineTo(42, 75);
      ctx.lineTo(214, 75);
      ctx.lineTo(214, 104);
      ctx.stroke();
      for (const [index, x] of [42, 128, 214].entries())
        bar(x - 21, 104, 42, Math.floor(time) % 3 === index ? "#e5c982" : "#85bdb2");
      bar(103, 40, 50, "#e7e0ce");
      break;
    case "organizing":
      for (let index = 0; index < 6; index++) {
        const x = 18 + (index % 3) * 80;
        const y = 35 + Math.floor(index / 3) * 55;
        bar(x, y, 22, "#e5c982");
        ctx.fillStyle = Math.floor(time * 1.5) % 6 === index ? "#e5c982" : "#85bdb2";
        ctx.fillRect(x, y + 5, 58, 30);
      }
      break;
    case "puzzled":
      ctx.fillStyle = "#e69587";
      ctx.font = "bold 44px Consolas";
      ctx.fillText("!", 25, 85);
      for (let row = 0; row < 4; row++) bar(75, 40 + row * 22, 120 - row * 15, "#e69587");
      ctx.strokeStyle = "#e5c982";
      ctx.strokeRect(69, 31 + (Math.floor(time) % 4) * 22, 155, 20);
      break;
    case "attention":
    case "celebrating":
      ctx.fillStyle = activity === "attention" ? "#e5c982" : "#85bdb2";
      ctx.font = "bold 64px Consolas";
      ctx.fillText(activity === "attention" ? "?" : "OK", activity === "attention" ? 110 : 80, 95);
      bar(60, 119, 136, Math.floor(time * 2) % 2 ? "#e7e0ce" : "#31515d");
      break;
    case "relaxing":
      ctx.fillStyle = "#85bdb2";
      ctx.beginPath();
      ctx.arc(128 + Math.sin(time * 0.5) * 70, 80 + Math.cos(time * 0.7) * 30, 12, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "away":
      bar(113, 78, 30, "#526b72");
      break;
    case "working":
      for (let index = 0; index < 4; index++) {
        ctx.fillStyle = index % 2 ? "#85bdb2" : "#e5c982";
        ctx.fillRect(
          20 + index * 58,
          115 - (30 + (Math.sin(time + index) + 1) * 22),
          38,
          30 + (Math.sin(time + index) + 1) * 22,
        );
      }
      break;
  }
}
