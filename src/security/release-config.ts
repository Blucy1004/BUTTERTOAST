// Release operator supplies these public values at build time. Never load publisher keys from a server response.
// No release server or signing identity has been provisioned for this development build.
export const RELEASE_CONFIG = Object.freeze({origin:'',manifestUrl:'',publisherPublicKey:''});
