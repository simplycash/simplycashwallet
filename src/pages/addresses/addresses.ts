import { Component } from '@angular/core'
import { IonicPage, LoadingController, NavController, NavParams } from 'ionic-angular'
import { TranslateService } from '@ngx-translate/core';
import { Wallet } from '../../providers/providers'

@IonicPage()
@Component({
  selector: 'page-addresses',
  templateUrl: 'addresses.html',
})
export class AddressesPage {

  private currentReceiveAddr: string
  private currentChangeAddr: string
  private receiveAddrs: { index: number, address: string }[]
  private changeAddrs: { index: number, address: string }[]
  private unspentAddrs: { address: string, balance: string }[]
  private type: string = 'receive'

  constructor(
    public loadingCtrl: LoadingController,
    public navCtrl: NavController,
    public navParams: NavParams,
    private translate: TranslateService,
    private wallet: Wallet
  ) {
  }

  async ionViewDidLoad() {
    let loader = this.loadingCtrl.create({
      content: this.translate.instant('LOADING_ADDRESSES')+'...'
    })
    await loader.present()
    this.currentReceiveAddr = this.wallet.getCacheReceiveAddress()
    this.currentChangeAddr = this.wallet.getCacheChangeAddress()
    this.receiveAddrs = this.wallet.getAllReceiveAddresses().map((addr: string, i: number, arr: string[]) => {
      return {
        index: i,
        address: addr
      }
    }).reverse()
    this.changeAddrs = this.wallet.getAllChangeAddresses().map((addr: string, i: number, arr: string[]) => {
      return {
        index: i,
        address: addr
      }
    }).reverse()
    this.unspentAddrs = this.wallet.getCacheUtxos().map((utxo: any) => {
      return {
        address: utxo.address,
        balance: this.wallet.convertUnit('SATS', 'BSV', utxo.satoshis.toString())
      }
    })
    // if (this.wallet.getPreferredAddressFormat() === 'cashaddr') {
    //   this.currentReceiveAddr = this.wallet.convertAddress('legacy', 'cashaddr', this.currentReceiveAddr)
    //   this.currentChangeAddr = this.wallet.convertAddress('legacy', 'cashaddr', this.currentChangeAddr)
    //   this.receiveAddrs.forEach((item: any) => {
    //     item.address = this.wallet.convertAddress('legacy', 'cashaddr', item.address)
    //   })
    //   this.changeAddrs.forEach((item: any) => {
    //     item.address = this.wallet.convertAddress('legacy', 'cashaddr', item.address)
    //   })
    //   this.unspentAddrs.forEach((item: any) => {
    //     item.address = this.wallet.convertAddress('legacy', 'cashaddr', item.address)
    //   })
    // }
    await loader.dismiss()
  }

  pushAddressPage(addr: any) {
    this.navCtrl.push('AddressPage', {
      address: addr.address
    })
  }

}
