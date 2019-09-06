/**
  Basic setup for demos.
  @param {object} options - GridToFullscreenEffect options. Lots of them
  @return {object} Configurator instance  
 */

function createDemoConfigurator(options) {
  const smallImages = [
    ...document.body.querySelectorAll(
      "img.content__img:not(.content__img--large)"
    )
  ];

  const largeImages = [
    ...document.body.querySelectorAll("img.content__img--large")
  ];
  const canvasWrapper = document.getElementById("app");
  const configurator = new Configurator(
    canvasWrapper,
    document.getElementById("items-wrap"),
    Object.assign(
      {
        scrollContainer: window,
        onToFullscreenFinish: ({ index }) => {},
        onToGridStart: ({ index }) => {},
        onProgressChange: ({ index, progress }) => {
          let opacity = progress > 0 ? 0 : 1;
          smallImages[index].style.opacity = opacity;
        },
        onToFullscreenStart: ({ index }) => {
          smallImages[index].style.opacity = 0;
        },
        onToGridFinish: ({ lastIndex }) => {
          smallImages[lastIndex].style.opacity = 1;
        }
      },
      options
    )
  );
  canvasWrapper.addEventListener("click", ev => {
    if (configurator.effect.isAnimating) return;

    configurator.effect.calculateMouse(ev);
    if (configurator.effect.isFullscreen) configurator.effect.toGrid();
    if (!configurator.effect.isFullscreen) configurator.effect.toFullscreen();
  });

  configurator.init();

  return configurator;
}

/**

  1. Update this.toGridEase and toFullEase
  2. options.duration
 */
