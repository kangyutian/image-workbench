const IMAGE2_MODELS = {
  "gpt-image-2": {
    id: "gpt-image-2",
    label: "Image 2",
    textEndpoint: "openai/gpt-image-2/text-to-image",
    editEndpoint: "openai/gpt-image-2/edit",
    envKey: "WAVESPEED_IMAGE2_KEY",
  },
  "gpt-image-2.5-sunburst": {
    id: "gpt-image-2.5-sunburst",
    label: "GPT Image 2.5 Sunburst",
    textEndpoint: "openai/gpt-image-2.5-sunburst/text-to-image",
    editEndpoint: "openai/gpt-image-2.5-sunburst/edit",
    envKey: "WAVESPEED_IMAGE25_KEY",
  },
};

const DEFAULT_IMAGE2_MODEL = IMAGE2_MODELS["gpt-image-2"];

export function image2ModelInfo(modelId = "") {
  return IMAGE2_MODELS[modelId] || DEFAULT_IMAGE2_MODEL;
}

export function image2EndpointFor(modelId = "", hasImages = false) {
  const model = image2ModelInfo(modelId);
  return hasImages ? model.editEndpoint : model.textEndpoint;
}

export function envKeyForImage2Model(modelId = "") {
  return image2ModelInfo(modelId).envKey;
}
