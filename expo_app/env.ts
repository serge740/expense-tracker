const ENV = {
  API_URL: 'https://aby-expense.onrender.com', // Base API URL
  UPLOADS_URL: 'https://aby-expense.onrender.com/uploads', // Add this line
  GOOGLE_MAPS_API_KEY: 'AIzaSyBoiNvomF4gz-nIdpSe73zXQO31n_G99gQ', // Replace with your actual Google Maps API key,
  FACEBOOK_APP_ID: '', // Meta for Developers → your app → App ID (leave empty to disable Facebook login)
  STRIPE_PUBLIC_API: 'pk_test_51R8ntNIq66RG72XTb22P223u9LisyDUweneT5aakMXT1gF2jy5n7h9ptaaJ1Ld2dcr18gzEzQXNLIWANamAKVGnc00VyipHkxN',
};

//  const ENV = {
//    // Temporary swap for passkey testing — needs HTTPS + a host matching backend RP_ID/ORIGIN.
//    // Swap back to the LAN IP below when you're not testing passkeys.
//   //  API_URL: 'https://trivial-marshy-false.ngrok-free.dev',
//   //  UPLOADS_URL: 'https://trivial-marshy-false.ngrok-free.dev/uploads',
//    API_URL: 'http://192.168.0.103:3001', // Expense Tracker backend — update IP to match your machine
//    UPLOADS_URL: 'http://192.168.0.103:3001/uploads',
//    GOOGLE_MAPS_API_KEY: 'AIzaSyBoiNvomF4gz-nIdpSe73zXQO31n_G99gQ',
//    FACEBOOK_APP_ID: '', // Meta for Developers → your app → App ID (leave empty to disable Facebook login)
//    STRIPE_PUBLIC_API : 'pk_test_51R8ntNIq66RG72XTb22P223u9LisyDUweneT5aakMXT1gF2jy5n7h9ptaaJ1Ld2dcr18gzEzQXNLIWANamAKVGnc00VyipHkxN'
//  };

export default ENV;