import MetaMaskOnboarding from '@metamask/onboarding';
// eslint-disable-next-line camelcase
import { recoverTypedSignature } from '@metamask/eth-sig-util';
import { ethers } from 'ethers';
import { toChecksumAddress } from 'ethereumjs-util';
import {
  handleSdkConnect,
  handleWalletConnect,
  walletConnect,
} from './connections';
import { NETWORKS_BY_CHAIN_ID } from './onchain-sample-contracts';

/**
 * Page
 */

const currentUrl = new URL(window.location.href);
const forwarderOrigin =
  currentUrl.hostname === 'localhost' ? 'http://localhost:9010' : undefined;
const urlSearchParams = new URLSearchParams(window.location.search);
let deployedContractAddress = urlSearchParams.get('contract');
if (!ethers.utils.isAddress(deployedContractAddress)) {
  deployedContractAddress = '';
}

let tokenDecimals = urlSearchParams.get('decimals');
if (!tokenDecimals) {
  tokenDecimals = '18';
}

const scrollTo = urlSearchParams.get('scrollTo');

/**
 * DOM
 */

// Provider Section
const eip6963Section = document.getElementById('eip6963');
const eip6963Warning = document.getElementById('eip6963Warning');
const activeProviderUUIDResult = document.getElementById('activeProviderUUID');
const activeProviderNameResult = document.getElementById('activeProviderName');
const activeProviderIconResult = document.getElementById('activeProviderIcon');
const providersDiv = document.getElementById('providers');
const useWindowProviderButton = document.getElementById(
  'useWindowProviderButton',
);

// Dapp Status Section
const networkDiv = document.getElementById('network');
const chainIdDiv = document.getElementById('chainId');
const accountsDiv = document.getElementById('accounts');
const warningDiv = document.getElementById('warning');

// Basic Actions Section
const onboardButton = document.getElementById('connectButton');
const getAccountsButton = document.getElementById('getAccounts');
const getAccountsResult = document.getElementById('getAccountsResult');
const walletConnectBtn = document.getElementById('walletConnect');
const sdkConnectBtn = document.getElementById('sdkConnect');

// Ethereum Signature Section
const merkleTree = document.getElementById('merkleTree');
const signTypedDataV4 = document.getElementById('signTypedDataV4');
const signTypedDataV4Result = document.getElementById('signTypedDataV4Result');
const signTypedDataV4Verify = document.getElementById('signTypedDataV4Verify');
const signTypedDataV4VerifyResult = document.getElementById(
  'signTypedDataV4VerifyResult',
);

// Buttons that require connecting an account
const allConnectedButtons = [signTypedDataV4, signTypedDataV4Verify];

// Buttons that are available after initially connecting an account
const initialConnectedButtons = [signTypedDataV4];

/**
 * Provider
 */

const providerDetails = [];
let provider;
let accounts = [];
let scrollToHandled = false;

const isMetaMaskConnected = () => accounts && accounts.length > 0;
let isWalletConnectConnected = false;
let isSdkConnected = false;

// TODO: Need to align with @metamask/onboarding
const isMetaMaskInstalled = () => provider && provider.isMetaMask;

walletConnectBtn.onclick = () => {
  walletConnect.open();
  walletConnect.subscribeProvider(() => {
    handleWalletConnect(
      'wallet-connect',
      walletConnectBtn,
      isWalletConnectConnected,
    );
  });
};

sdkConnectBtn.onclick = async () => {
  await handleSdkConnect('sdk-connect', sdkConnectBtn, isSdkConnected);
};

export function updateWalletConnectState(isConnected) {
  isWalletConnectConnected = isConnected;
}

export function updateSdkConnectionState(isConnected) {
  isSdkConnected = isConnected;
}

const detectEip6963 = () => {
  window.addEventListener('eip6963:announceProvider', (event) => {
    if (event.detail.info.uuid) {
      eip6963Warning.hidden = true;
      eip6963Section.hidden = false;

      handleNewProviderDetail(event.detail);
    }
  });

  window.dispatchEvent(new Event('eip6963:requestProvider'));
};

export const setActiveProviderDetail = async (providerDetail) => {
  closeProvider();
  provider = providerDetail.provider;
  initializeProvider();

  try {
    const newAccounts = await provider.request({
      method: 'eth_accounts',
    });
    handleNewAccounts(newAccounts);
  } catch (err) {
    console.error('Error on init when getting accounts', err);
  }

  const { uuid, name, icon } = providerDetail.info;
  activeProviderUUIDResult.innerText = uuid;
  activeProviderNameResult.innerText = name;
  activeProviderIconResult.innerHTML = icon
    ? `<img src="${icon}" height="90" width="90" />`
    : '';
  updateFormElements();
};

const setActiveProviderDetailWindowEthereum = () => {
  const providerDetail = {
    info: {
      uuid: '',
      name: 'window.ethereum',
      icon: '',
    },
    provider: window.ethereum,
  };

  setActiveProviderDetail(providerDetail);
};

const existsProviderDetail = (newProviderDetail) => {
  const existingProvider = providerDetails.find(
    (providerDetail) =>
      providerDetail.info &&
      newProviderDetail.info &&
      providerDetail.info.uuid === newProviderDetail.info.uuid,
  );

  if (existingProvider) {
    if (
      existingProvider.info.name !== newProviderDetail.info.name ||
      existingProvider.info.rdns !== newProviderDetail.info.rdns ||
      existingProvider.info.image !== newProviderDetail.info.image
    ) {
      console.error(
        `Received new ProviderDetail with name "${newProviderDetail.info.name}", rdns "${newProviderDetail.info.rdns}, image "${newProviderDetail.info.image}, and uuid "${existingProvider.info.uuid}" matching uuid of previously received ProviderDetail with name "${existingProvider.info.name}", rdns "${existingProvider.info.rdns}", and image "${existingProvider.info.image}"`,
      );
    }
    console.log(
      `Ignoring ProviderDetail with name "${newProviderDetail.info.name}", rdns "${newProviderDetail.info.rdns}", and uuid "${existingProvider.info.uuid}" that was already received before`,
    );
    return true;
  }
  return false;
};

export const handleNewProviderDetail = (newProviderDetail) => {
  if (existsProviderDetail(newProviderDetail)) {
    return;
  }
  providerDetails.push(newProviderDetail);
  renderProviderDetails();
};

export const removeProviderDetail = (name) => {
  const index = providerDetails.findIndex(
    (providerDetail) => providerDetail.info.name === name,
  );
  if (index === -1) {
    console.log(`ProviderDetail with name ${name} not found`);
    return;
  }
  providerDetails.splice(index, 1);
  renderProviderDetails();
  console.log(`ProviderDetail with name ${name} removed successfully`);
};

const renderProviderDetails = () => {
  providersDiv.innerHTML = '';
  providerDetails.forEach((providerDetail) => {
    const { info, provider: provider_ } = providerDetail;

    const content = JSON.stringify(
      {
        info,
        provider: provider_ ? '...' : provider_,
      },
      null,
      2,
    );
    const eip6963Provider = document.createElement('div');
    eip6963Provider.id = 'provider';
    eip6963Provider.className = 'col-xl-6 col-lg-6 col-md-12 col-sm-12 col-12';
    providersDiv.append(eip6963Provider);

    const pre = document.createElement('pre');
    pre.className = 'alert alert-secondary';
    pre.innerText = content;
    eip6963Provider.appendChild(pre);

    const button = document.createElement('button');
    button.className = 'btn btn-primary btn-lg btn-block mb-3';
    button.innerHTML = `Use ${info.name}`;
    button.onclick = () => {
      setActiveProviderDetail(providerDetail);
    };
    eip6963Provider.appendChild(button);
  });
};

export const handleNewAccounts = (newAccounts) => {
  accounts = newAccounts;
  updateFormElements();

  accountsDiv.innerHTML = accounts;
};

let chainIdInt;
let networkName;
let chainIdPadded;

const handleNewChain = (chainId) => {
  chainIdDiv.innerHTML = chainId;
  const networkId = parseInt(networkDiv.innerHTML, 10);
  chainIdInt = parseInt(chainIdDiv.innerHTML, 16) || networkId;
  chainIdPadded = `0x${chainIdInt.toString(16).padStart(77, '0')}`;
  networkName = NETWORKS_BY_CHAIN_ID[chainIdInt];

  if (chainId === '0x1') {
    warningDiv.classList.remove('warning-invisible');
  } else {
    warningDiv.classList.add('warning-invisible');
  }

  // Wait until warning rendered or not to improve accuracy
  if (!scrollToHandled) {
    handleScrollTo({ delay: true });
  }
};

const handleNewNetwork = (networkId) => {
  networkDiv.innerHTML = networkId;
};

const getNetworkAndChainId = async () => {
  try {
    const chainId = await provider.request({
      method: 'eth_chainId',
    });
    handleNewChain(chainId);

    const networkId = await provider.request({
      method: 'net_version',
    });
    handleNewNetwork(networkId);
  } catch (err) {
    console.error(err);
  }
};

// Must be called before the active provider changes
// Resets provider state and removes any listeners from active provider
const closeProvider = () => {
  // move these
  handleNewAccounts([]);
  handleNewChain('');
  handleNewNetwork('');
  if (isMetaMaskInstalled()) {
    provider.removeListener('chainChanged', handleNewChain);
    provider.removeListener('networkChanged', handleNewNetwork);
    provider.removeListener('accountsChanged', handleNewAccounts);
  }
};

// Must be called after the active provider changes
// Initializes active provider and adds any listeners
const initializeProvider = async () => {
  updateFormElements();

  if (isMetaMaskInstalled()) {
    provider.autoRefreshOnNetworkChange = false;
    getNetworkAndChainId();

    provider.on('chainChanged', handleNewChain);
    provider.on('networkChanged', handleNewNetwork);
    provider.on('accountsChanged', handleNewAccounts);

    try {
      const newAccounts = await provider.request({
        method: 'eth_accounts',
      });
      handleNewAccounts(newAccounts);
    } catch (err) {
      console.error('Error on init when getting accounts', err);
    }
  } else {
    handleScrollTo();
  }
};

/**
 * Misc
 */

const handleScrollTo = async ({ delay = false } = {}) => {
  if (!scrollTo) {
    return;
  }

  scrollToHandled = true;

  console.log('Attempting to scroll to element with ID:', scrollTo);

  const scrollToElement = document.getElementById(scrollTo);

  if (!scrollToElement) {
    console.warn('Cannot find element with ID:', scrollTo);
    return;
  }

  if (delay) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  scrollToElement.scrollIntoView();
};

/**
 * Form / Elements
 */

// Must be called after the provider or connect acccounts change
// Updates form elements content and disabled status
export const updateFormElements = () => {
  const accountButtonsDisabled =
    !isMetaMaskInstalled() || !isMetaMaskConnected();
  if (accountButtonsDisabled) {
    for (const button of allConnectedButtons) {
      button.disabled = true;
    }
    clearDisplayElements();
  }
  if (isMetaMaskConnected()) {
    for (const button of initialConnectedButtons) {
      button.disabled = false;
    }
  }

  updateOnboardElements();
};

const clearDisplayElements = () => {
  getAccountsResult.innerText = '';
};

const updateOnboardElements = () => {
  let onboarding;
  try {
    onboarding = new MetaMaskOnboarding({ forwarderOrigin });
  } catch (error) {
    console.error(error);
  }

  if (isMetaMaskInstalled()) {
  } else {
    onboardButton.innerText = 'Click here to install MetaMask!';
    onboardButton.onclick = () => {
      onboardButton.innerText = 'Onboarding in progress';
      onboardButton.disabled = true;
      onboarding.startOnboarding();
    };
    onboardButton.disabled = false;
  }

  if (isMetaMaskConnected()) {
    onboardButton.innerText = 'Connected';
    onboardButton.disabled = true;
    if (onboarding) {
      onboarding.stopOnboarding();
    }
  } else {
    onboardButton.innerText = 'Connect';
    onboardButton.onclick = async () => {
      try {
        const newAccounts = await provider.request({
          method: 'eth_requestAccounts',
        });
        handleNewAccounts(newAccounts);
      } catch (error) {
        console.error(error);
      }
    };
    onboardButton.disabled = false;
  }

  if (isWalletConnectConnected) {
    if (onboarding) {
      onboarding.stopOnboarding();
    }
    provider.autoRefreshOnNetworkChange = false;
    getNetworkAndChainId();

    provider.on('chainChanged', handleNewChain);
    provider.on('chainChanged', handleNewNetwork);
    provider.on('accountsChanged', handleNewAccounts);
  }
};

// Initializes form button onclicks
const initializeFormElements = () => {
  getAccountsButton.onclick = async () => {
    try {
      const _accounts = await provider.request({
        method: 'eth_accounts',
      });
      getAccountsResult.innerHTML = _accounts || 'Not able to get accounts';
    } catch (err) {
      console.error(err);
      getAccountsResult.innerHTML = `Error: ${err.message}`;
    }
  };

  /**
   * Sign Typed Data V4
   */
  signTypedDataV4.onclick = async () => {
    const msgParams = {
      domain: {
        name: 'Sphinx',
        version: '1.0.0',
      },
      message: {
        root: merkleTree.value
      },
      primaryType: 'MerkleRoot',
      types : {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
        ],
        MerkleRoot: [{ name: 'root', type: 'bytes32' }]
      }
    };

    try {
      const from = accounts[0];
      const sign = await provider.request({
        method: 'eth_signTypedData_v4',
        params: [from, JSON.stringify(msgParams)],
      });
      signTypedDataV4Result.innerHTML = sign;
      signTypedDataV4Verify.disabled = false;
    } catch (err) {
      console.error(err);
      signTypedDataV4Result.innerHTML = `Error: ${err.message}`;
    }
  };

  /**
   *  Sign Typed Data V4 Verification
   */
  signTypedDataV4Verify.onclick = async () => {
    const msgParams = {
      domain: {
        name: 'Sphinx',
        version: '1.0.0',
      },
      message: {
        root: merkleTree.value
      },
      primaryType: 'MerkleRoot',
      types : {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
        ],
        MerkleRoot: [{ name: 'root', type: 'bytes32' }]
      }
    };

    try {
      const from = accounts[0];
      const sign = signTypedDataV4Result.innerHTML;
      const recoveredAddr = recoverTypedSignature({
        data: msgParams,
        signature: sign,
        version: 'V4',
      });
      if (toChecksumAddress(recoveredAddr) === toChecksumAddress(from)) {
        console.log(`Successfully verified signer as ${recoveredAddr}`);
        signTypedDataV4VerifyResult.innerHTML = recoveredAddr;
      } else {
        console.log(
          `Failed to verify signer when comparing ${recoveredAddr} to ${from}`,
        );
      }
    } catch (err) {
      console.error(err);
      signTypedDataV4VerifyResult.innerHTML = `Error: ${err.message}`;
    }
  };

  useWindowProviderButton.onclick = setActiveProviderDetailWindowEthereum;
};

/**
 * Entrypoint
 */

const initialize = async () => {
  setActiveProviderDetailWindowEthereum();
  detectEip6963();
  setActiveProviderDetail(providerDetails[0]);
  initializeFormElements();
};

window.addEventListener('load', initialize);
