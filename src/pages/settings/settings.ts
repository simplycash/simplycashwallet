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
  public isLeaving: boolean
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
    if (this.isLeaving) {
      return
    }
    this.isLeaving = true
    this.viewCtrl.dismiss()
    this.app.getRootNav().push('HistoryPage')
  }

  pushSendPage() {
    if (this.isLeaving) {
      return
    }
    this.isLeaving = true
    this.viewCtrl.dismiss()
    this.app.getRootNav().push('SendPage')
  }

  pushMorePage() {
    if (this.isLeaving) {
      return
    }
    this.isLeaving = true
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
      await this.wallet.promptForRecovery()
    } else {
      await this.wallet.switchWallet(this.currentWallet)
    }
    this.refresh()
  }

  // setAddressFormat() {
  //   if (this.useCashAddr) {
  //     return this.wallet.setPreferredAddressFormat('cashaddr').catch((err: any) => {console.log(err)})
  //   } else {
  //     return this.wallet.setPreferredAddressFormat('legacy').catch((err: any) => {console.log(err)})
  //   }
  // }

}
