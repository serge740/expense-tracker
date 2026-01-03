import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import {
  GoogleSignin,
  GoogleSigninButton,
  statusCodes,
} from '@react-native-google-signin/google-signin';

type UserInfo = {
  idToken: string | null;
  serverAuthCode: string | null;
  scopes: string[];
  user: {
    id: string;
    name: string | null;
    email: string;
    photo: string | null;
    familyName: string | null;
    givenName: string | null;
  };
} | null;

export default function App() {
  const [userInfo, setUserInfo] = useState<UserInfo>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    initGoogleSignIn();
  }, []);

  const initGoogleSignIn = async () => {
    try {
      // Configure Google Sign-In
      GoogleSignin.configure({
        webClientId: '936996911068-a2e2v1jjq9c7hmotp339l1spqe75g102.apps.googleusercontent.com',
        offlineAccess: true,
        // For iOS, you might also need:
        // iosClientId: 'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com',
      });

      setIsConfigured(true);

      // Check if user is already signed in
    
      const currentUser = await GoogleSignin.getCurrentUser();
      if (currentUser) {
        setUserInfo(currentUser);
      }
    } catch (error) {
      console.error('Google Sign-In initialization error:', error);
      Alert.alert(
        'Initialization Error',
        'Failed to initialize Google Sign-In. Please restart the app.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const signIn = async () => {
    if (!isConfigured) {
      Alert.alert('Error', 'Google Sign-In is not configured yet');
      return;
    }

    setIsLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      const {data} = await GoogleSignin.signIn();
     console.log('usets sslf : +>',data?.user);
     
      
      
     setUserInfo(data)
      Alert.alert('Success', `Welcome ${data?.user.name || 'User'}!`);
    } catch (error: any) {
      console.error('Sign in error:', error);
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        Alert.alert('Cancelled', 'Sign-in was cancelled');
      } else if (error.code === statusCodes.IN_PROGRESS) {
        Alert.alert('In Progress', 'Sign-in is already in progress');
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert('Error', 'Play Services not available or outdated');
      } else {
        Alert.alert('Sign-In Failed', error.message || 'Unknown error occurred');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    try {
      await GoogleSignin.signOut();
      setUserInfo(null);
      Alert.alert('Signed Out', 'You have been signed out successfully');
    } catch (error) {
      console.error('Sign out error:', error);
      Alert.alert('Error', 'Failed to sign out');
    }
  };

  if (isLoading && !isConfigured) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4285F4" />
        <Text style={styles.loadingText}>Initializing Google Sign-In...</Text>
      </View>
    );
  }

  if (userInfo) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Welcome!</Text>

        {userInfo.user.photo ? (
          <Image source={{ uri: userInfo.user.photo }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>
              {userInfo.user.name?.charAt(0).toUpperCase() || 'U'}
            </Text>
          </View>
        )}

        <Text style={styles.name}>{userInfo.user.name || 'No name'}</Text>
        <Text style={styles.email}>{userInfo.user.email}</Text>

        <View style={styles.detailsCard}>
          <Text style={styles.detailLabel}>User ID:</Text>
          <Text style={styles.detailValue}>{userInfo.user.id}</Text>

          <Text style={styles.detailLabel}>Given Name:</Text>
          <Text style={styles.detailValue}>{userInfo.user.givenName || '—'}</Text>

          <Text style={styles.detailLabel}>Family Name:</Text>
          <Text style={styles.detailValue}>{userInfo.user.familyName || '—'}</Text>

          <Text style={styles.detailLabel}>ID Token:</Text>
          <Text style={styles.detailValue} numberOfLines={2}>
            {userInfo.idToken ? userInfo.idToken.substring(0, 50) + '...' : 'None'}
          </Text>

          {userInfo.serverAuthCode && (
            <>
              <Text style={styles.detailLabel}>Server Auth Code:</Text>
              <Text style={styles.detailValue}>Available</Text>
            </>
          )}
        </View>

        <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Google Sign-In Demo</Text>
      <Text style={styles.subtitle}>Tap below to sign in with Google</Text>

      <GoogleSigninButton
        size={GoogleSigninButton.Size.Wide}
        color={GoogleSigninButton.Color.Dark}
        onPress={signIn}
        disabled={isLoading || !isConfigured}
      />

      {isLoading && (
        <ActivityIndicator
          size="small"
          color="#4285F4"
          style={styles.loadingIndicator}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 40,
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  loadingIndicator: {
    marginTop: 20,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 20,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#4285F4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarText: {
    fontSize: 48,
    color: '#fff',
    fontWeight: 'bold',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  email: {
    fontSize: 18,
    color: '#666',
    marginBottom: 30,
  },
  detailsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    marginBottom: 30,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4285F4',
    marginTop: 12,
  },
  detailValue: {
    fontSize: 16,
    color: '#333',
    marginBottom: 8,
  },
  signOutButton: {
    backgroundColor: '#DB4437',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 8,
  },
  signOutText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});