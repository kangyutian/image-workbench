const POLL_AFTER_SECONDS = 5;

function resultForTask(task, publicTask = (value) => value) {
  return {
    task_id: task.id,
    kind: task.kind,
    status: task.status,
    poll_after_seconds: POLL_AFTER_SECONDS,
    task: publicTask(task),
  };
}

function resultForSuite(suite, publicSuite = (value) => value, task = null) {
  return {
    suite_id: suite.id,
    status: suite.status,
    poll_after_seconds: POLL_AFTER_SECONDS,
    suite: publicSuite(suite),
    ...(task ? { task_id: task.id } : {}),
  };
}

function rememberOrCreate(deps, toolName, key, create) {
  const scopedKey = `${toolName}:${key}`;
  const previous = deps.idempotency?.get?.(deps.owner, scopedKey);
  if (previous?.response) return previous.response;
  return Promise.resolve(create()).then((response) => {
    deps.idempotency?.put?.(deps.owner, scopedKey, { response, createdAt: new Date().toISOString() });
    return response;
  });
}

function imageModelRequest(model, options = {}) {
  const modelId = String(model || "");
  if (modelId === "image2" || modelId === "image-2") return { provider: "image2", ...options };
  if (modelId.startsWith("grok-")) return { provider: "grok", nanoModel: modelId, ...options };
  if (modelId.startsWith("kling-image-")) return { provider: "kling", nanoModel: modelId, ...options };
  return { provider: "nanobanana", nanoModel: modelId, ...options };
}

async function resolveMedia(deps, refs, mediaKind) {
  return Promise.all((refs || []).filter(Boolean).map((ref) => deps.resolveMediaRef(ref, { mediaKind, owner: deps.owner })));
}

function normalizeBodyType(bodyType) {
  return { fat: "plus", voluptuous: "curvy" }[bodyType] || bodyType;
}

export function createMcpOperations(deps) {
  const publicTask = deps.publicTask || ((value) => value);
  const publicSuite = deps.publicSuite || ((value) => value);

  return {
    listCapabilities: () => deps.capabilities(),
    getUpload: ({ uploadId }) => deps.getUpload({ uploadId, owner: deps.owner }),
    listTasks: (filters) => deps.listTasks({ ...filters, owner: deps.owner }),
    getTask: ({ taskId }) => deps.getTask({ taskId, owner: deps.owner }),
    listProductSuites: () => deps.listProductSuites({ owner: deps.owner }),
    getProductSuite: ({ suiteId }) => deps.getProductSuite({ suiteId, owner: deps.owner }),
    getTaskDownload: ({ taskId }) => deps.getTaskDownload({ taskId, owner: deps.owner }),
    getProductSuiteDownload: ({ suiteId }) => deps.getProductSuiteDownload({ suiteId, owner: deps.owner }),

    createUploadTicket: (input) => rememberOrCreate(deps, "create_upload_ticket", input.idempotency_key, () => deps.createUploadTicket({ ...input, owner: deps.owner })),

    createImageTask: async (input) => rememberOrCreate(deps, "create_image_task", input.idempotency_key, async () => {
      const options = input.options && typeof input.options === "object" ? input.options : {};
      const taskInput = {
        kind: "image",
        ...imageModelRequest(input.model, options),
        prompt: input.prompt,
        images: await resolveMedia(deps, input.images, "image"),
        ...(input.count === undefined ? {} : { count: input.count }),
        ...(input.aspect_ratio ? { aspectRatio: input.aspect_ratio } : {}),
        ...(input.resolution ? { resolution: input.resolution } : {}),
        ...(input.quality ? { quality: input.quality } : {}),
      };
      const task = await deps.createTask(taskInput, deps.owner);
      deps.enqueue(task);
      return resultForTask(task, publicTask);
    }),

    createVideoTask: async (input) => rememberOrCreate(deps, "create_video_task", input.idempotency_key, async () => {
      const frames = await resolveMedia(deps, [input.first_frame, input.end_frame], "image");
      const taskInput = {
        kind: "video",
        ...(input.options && typeof input.options === "object" ? input.options : {}),
        modelId: input.model,
        prompt: input.prompt || "",
        referenceImages: frames,
        ...(input.motion_reference ? { motionVideo: await deps.resolveMediaRef(input.motion_reference, { mediaKind: "video", owner: deps.owner }) } : {}),
        ...(input.duration === undefined ? {} : { duration: input.duration }),
        ...(input.aspect_ratio ? { aspectRatio: input.aspect_ratio } : {}),
        ...(input.resolution ? { resolution: input.resolution } : {}),
        ...(input.audio === undefined ? {} : { generateAudio: input.audio }),
      };
      const task = await deps.createTask(taskInput, deps.owner);
      deps.enqueue(task);
      return resultForTask(task, publicTask);
    }),

    createCutoutTask: async (input) => rememberOrCreate(deps, "create_cutout_task", input.idempotency_key, async () => {
      const image = await deps.resolveMediaRef(input.image, { mediaKind: "image", owner: deps.owner });
      const task = await deps.createTask({ mode: "product-cutout", provider: "bria", nanoModel: "bria-extract-object", prompt: "main product", backgroundMode: input.background, images: [image] }, deps.owner);
      deps.enqueue(task);
      return resultForTask(task, publicTask);
    }),

    createProductSuite: async (input) => rememberOrCreate(deps, "create_product_suite", input.idempotency_key, async () => {
      const productImages = await resolveMedia(deps, input.product_images?.length ? input.product_images : [input.product_image], "image");
      const backgroundImage = input.background_image ? await deps.resolveMediaRef(input.background_image, { mediaKind: "image", owner: deps.owner }) : null;
      const modelReferenceImage = input.model_reference_image ? await deps.resolveMediaRef(input.model_reference_image, { mediaKind: "image", owner: deps.owner }) : null;
      const suiteInput = {
        images: productImages,
        backgroundImages: backgroundImage ? [backgroundImage] : [],
        ...(modelReferenceImage ? { modelReferenceImage } : {}),
        backgroundMode: backgroundImage ? "custom" : "white",
        productName: input.product_name || "",
        sellingPoints: input.selling_points || "",
        style: input.visual_style || "",
        model: input.model || "kling",
        gender: input.gender || "female",
        bodyType: normalizeBodyType(input.body_type || "balanced"),
        ageRange: input.age_range || "25-35",
        hairStyle: input.hair_style || "natural-loose",
        hairColor: input.hair_color || "natural",
        skinTone: input.skin_tone || "natural",
        prompts: input.prompts || {},
      };
      const created = await deps.createProductSuite(suiteInput, deps.owner);
      deps.enqueue(created.task);
      return resultForSuite(created.suite, publicSuite, created.task);
    }),

    retryTask: (input) => rememberOrCreate(deps, "retry_task", input.idempotency_key, async () => resultForTask(await deps.retryTask({ taskId: input.task_id, owner: deps.owner }), publicTask)),
    cancelTask: (input) => rememberOrCreate(deps, "cancel_task", input.idempotency_key, async () => resultForTask(await deps.cancelTask({ taskId: input.task_id, owner: deps.owner }), publicTask)),
    retryProductSuiteSlot: (input) => rememberOrCreate(deps, "retry_product_suite_slot", input.idempotency_key, async () => {
      const retried = await deps.retryProductSuiteSlot({ suiteId: input.suite_id, slot: input.slot, owner: deps.owner });
      return resultForSuite(retried.suite, publicSuite, retried.task);
    }),
  };
}
