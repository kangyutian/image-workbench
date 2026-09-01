export type ProductSuiteSlot = "product-3d" | "model-front" | "model-angle" | "model-back";
export type ProductSuiteModel = "kling" | "nanobanana" | "image2";
export type ProductSuiteStatus = "queued" | "running" | "partial" | "done" | "error";
export type ProductSuiteGender = "female" | "male";
export type ProductSuiteBodyType = "slim" | "balanced" | "athletic" | "muscular" | "plus" | "curvy" | "hourglass";
export type ProductSuiteAgeRange = "18-24" | "25-35" | "36-45" | "46-55" | "56-plus";
export type ProductSuiteHairStyle = "natural-loose" | "long-straight" | "long-wavy" | "low-ponytail" | "high-ponytail" | "short" | "bob";
export type ProductSuiteSkinTone = "natural" | "fair" | "medium" | "tan" | "deep";
export interface ProductSuiteMedia { id: string; fileName: string; dataUrl: string; mimeType: string; size?: number; }
export interface ProductSuiteItem { slot: ProductSuiteSlot; label: string; status: ProductSuiteStatus | "done" | "error"; prompt: string; defaultPrompt?: string; resultUrl: string; error: string; }
export interface ProductSuite { id: string; status: ProductSuiteStatus; createdAt: string; updatedAt: string; input: { model: ProductSuiteModel; nanoModel: string; gender: ProductSuiteGender; bodyType: ProductSuiteBodyType; ageRange: ProductSuiteAgeRange; hairStyle: ProductSuiteHairStyle; skinTone: ProductSuiteSkinTone; backgroundMode: "white" | "custom"; aspectRatio: "4:5"; resolution: "2k"; productName: string; sellingPoints: string; style?: string; prompts: Record<ProductSuiteSlot, string> }; items: ProductSuiteItem[]; recovery?: { canRecoverBackground: boolean }; }
export interface CreateProductSuiteInput { images: ProductSuiteMedia[]; backgroundImages?: ProductSuiteMedia[]; model: ProductSuiteModel; gender: ProductSuiteGender; bodyType: ProductSuiteBodyType; ageRange: ProductSuiteAgeRange; hairStyle: ProductSuiteHairStyle; skinTone: ProductSuiteSkinTone; backgroundMode: "white" | "custom"; productName: string; sellingPoints: string; prompts: Partial<Record<ProductSuiteSlot, string>>; }
