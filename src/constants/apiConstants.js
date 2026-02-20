export const ApiConstants = {
    //BASE_URL: "https://localhost:7268/api",
    BASE_URL: "https://trainers-wright-carnival-blackberry.trycloudflare.com/api",
};

export function isLocalDev() {
    return ApiConstants.BASE_URL.includes('localhost') || ApiConstants.BASE_URL.includes('127.0.0.1');
}
