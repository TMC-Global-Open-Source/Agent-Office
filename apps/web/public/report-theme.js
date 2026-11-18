(() => {
  const param = new URLSearchParams(window.location.search).get("scoutTheme");
  const theme =
    param === "dark" || param === "light"
      ? param
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  document.documentElement.setAttribute("data-theme", theme);
})();
