/* Public browser configuration. Never put service_role or Cloudinary API secrets here. */
window.ADULT_CONFIG = {
  supabaseUrl: 'https://dgkyuijpviidrmqenclb.supabase.co',
  supabaseAnonKey: 'sb_publishable_dh32TIUWgQWzRqR1KevZLQ_LiyREZ7d',
  cloudName: 'm3qbt9bk',
  cloudConfigVersion: 2,
  unsignedUploadPreset: 'Adult_Story',
  signedUpload: false,
  customerApi: '/api/member',
  refreshSeconds: 30
};
// Explicit recovery mode for existing local data; never enabled on hosted sites.
if (['localhost','127.0.0.1','[::1]'].includes(location.hostname) && new URLSearchParams(location.search).get('local') === '1') {
  window.ADULT_CONFIG.localContentMode = true;
}
