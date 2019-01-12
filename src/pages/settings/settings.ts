import { Component } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { AlertController, App, IonicPage, LoadingController, NavController, NavParams, Platform, ViewController } from 'ionic-angular'
import { Wallet } from '../../providers/providers'

/**
* The Settings page is a simple form that syncs with a Settings provider
* to enable the user to customize settings for the app.
*
*/
@IonicPage()
@Component({
  selector: 'page-settings',
  templateUrl: 'settings.html'
})
export class SettingsPage {
  public cryptoUnit: string
  public supportedCryptoUnits: string[]
  public currency: string
  public supportedCurrencies: string[]
  public protection: string
  public supportedProtections: string[]
  public currentWallet: string
  public allWallets: string[]
  // public useCashAddr: boolean

  constructor(
    public alertCtrl: AlertController,
    public app: App,
    public loadingCtrl: LoadingController,
    public navCtrl: NavController,
    public navParams: NavParams,
    public platform: Platform,
    public translate: TranslateService,
    public viewCtrl: ViewController,
    public wallet: Wallet
  ) {
    this.refresh()
  }

  refresh() {
    this.cryptoUnit = this.wallet.getPreferredCryptoUnit()
    this.supportedCryptoUnits = this.wallet.getSupportedCryptoUnits()
    this.currency = this.wallet.getPreferredCurrency()
    this.supportedCurrencies = this.wallet.getSupportedCurrencies()
    this.protection = this.wallet.getPreferredProtection()
    this.supportedProtections = this.wallet.getSupportedProtections()
    this.currentWallet = this.wallet.getCurrentWalletName()
    this.allWallets = this.wallet.getAllWalletNames().sort().concat([this.translate.instant('RECOVER_WALLET')])
    // this.useCashAddr = this.wallet.getPreferredAddressFormat() === 'cashaddr'
  }

  pushHistoryPage() {
    this.viewCtrl.dismiss()
    this.app.getRootNav().push('HistoryPage')
  }

  pushSendPage() {
    this.viewCtrl.dismiss()
    this.app.getRootNav().push('SendPage')
  }

  pushMorePage() {
    this.viewCtrl.dismiss()
    this.app.getRootNav().push('MorePage')
  }

  setCryptoUnit() {
    return this.wallet.setPreferredCryptoUnit(this.cryptoUnit).catch((err: any) => {console.log(err)})
  }

  setCurrency() {
    return this.wallet.setPreferredCurrency(this.currency).catch((err: any) => {console.log(err)})
  }

  async setProtection() {
    if (this.protection === this.wallet.getPreferredProtection()) {
      return
    }
    try {
      let m: string = await this.wallet.authorize()
      await this.wallet.setPreferredProtection(this.protection, m)
    } catch (err) {
      if (err.message !== 'cancelled') {
        console.log(err)
      }
      this.refresh()
    }
  }

  async setCurrentWallet() {
    if (this.currentWallet === this.wallet.getCurrentWalletName()) {
      return
    }
    if (this.currentWallet === this.allWallets[this.allWallets.length - 1]) {
      await this.promptForMnemonic()
    } else {
      await this.wallet.switchWallet(this.currentWallet)
      this.refresh()
    }
  }

  // setAddressFormat() {
  //   if (this.useCashAddr) {
  //     return this.wallet.setPreferredAddressFormat('cashaddr').catch((err: any) => {console.log(err)})
  //   } else {
  //     return this.wallet.setPreferredAddressFormat('legacy').catch((err: any) => {console.log(err)})
  //   }
  // }

  async promptForMnemonic() {
    let recoverAlert = this.alertCtrl.create({
      enableBackdropDismiss: false,
      title: this.translate.instant('RECOVER_WALLET'),
      message: this.translate.instant('RECOVERY_HINT'),
      inputs: [{
        name: 'name',
        placeholder: this.wallet.nextWalletName()
      }, {
        name: 'mnemonic',
        placeholder: this.translate.instant('RECOVERY_PHRASE')
      }, {
        name: 'path',
        placeholder: "m/44'/145'/0'"
      }, {
        name: 'passphrase',
        placeholder: this.translate.instant('RECOVERY_PASSPHRASE')
      }],
      buttons: [{
        role: 'cancel',
        text: this.translate.instant('CANCEL'),
        handler: data => {
          recoverAlert.dismiss().then(() => {
            this.refresh()
          })
          return false
        }
      },{
        text: this.translate.instant('OK'),
        handler: data => {
          if (
            (!data.name || this.nameIsValid(data.name)) &&
            (!data.mnemonic || this.mnemonicIsValid(data.mnemonic)) &&
            (!data.path || this.pathIsValid(data.path))
          ) {
            recoverAlert.dismiss().then(() => {
              return this.recover(data.mnemonic, data.path, data.passphrase, data.name)
            }).catch((err) => {
              console.log(err)
            }).then(() => {
              this.refresh()
            })
          }
          return false
        }
      }]
    })
    await recoverAlert.present()
  }

  nameIsValid(name: string) {
    if (this.wallet.getAllWalletNames().indexOf(name) !== -1) {
      this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: this.translate.instant('ERR_INVALID_WALLET_NAME'),
        buttons: [this.translate.instant('OK')]
      }).present()
      return false
    } else {
      return true
    }
  }

  mnemonicIsValid(m: string) {
    m = m.trim()
    if (!this.wallet.validateMnemonic(m)) {
      this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: this.translate.instant('ERR_INVALID_RECOVERY_PHRASE'),
        buttons: [this.translate.instant('OK')]
      }).present()
      return false
    } else {
      return true
    }
  }

  pathIsValid(path: string) {
    path = path.trim().replace(/[‘’]/g,"'")
    if (!path.match(/^m(\/\d+'?)*$/g)) {
      this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: this.translate.instant('ERR_INVALID_DERIVATION_PATH'),
        buttons: [this.translate.instant('OK')]
      }).present()
      return false
    } else {
      return true
    }
  }

  async recover(mnemonic?: string, path?: string, passphrase?: string, name?: string) {
    mnemonic = mnemonic ? mnemonic.trim() : undefined
    path = path ? path.trim().replace(/[‘’]/g,"'") : undefined
    passphrase = passphrase || undefined
    name = name || undefined
    let translations: string[]
    if (mnemonic) {
      translations = ['RECOVERING', 'RECOVER_SUCCESS', 'RECOVER_FAILED']
    } else {
      translations = ['CREATING', 'CREATE_SUCCESS', 'CREATE_FAILED']
    }
    let error: any
    let loader = this.loadingCtrl.create({
      content: this.translate.instant(translations[0]) + '...'
    })
    await loader.present()
    try {
      await this.wallet.recoverWalletFromMnemonic(mnemonic, path, passphrase, name)
    } catch (err) {
      console.log(err)
      error = err
    }
    await loader.dismiss()
    if (!error) {
      await this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('SUCCESS'),
        message: this.translate.instant(translations[1]),
        buttons: [this.translate.instant('OK')]
      }).present()
    } else {
      await this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: this.translate.instant(translations[2]),
        buttons: [this.translate.instant('OK')]
      }).present()
    }
  }

}
