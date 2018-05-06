import { Component } from '@angular/core'
import { IonicPage, NavController, NavParams } from 'ionic-angular'

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
    public navCtrl: NavController,
    public navParams: NavParams,
    private wallet: Wallet
  ) {
  }

  ionViewDidLoad() {
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
        balance: this.wallet.convertUnit('SATOSHIS', 'BCH', utxo.satoshis.toString())
      }
    })
    if (this.wallet.getPreferedAddressFormat() === 'cashaddr') {
      this.currentReceiveAddr = this.wallet.convertAddress('legacy', 'cashaddr', this.currentReceiveAddr)
      this.currentChangeAddr = this.wallet.convertAddress('legacy', 'cashaddr', this.currentChangeAddr)
      this.receiveAddrs.forEach((item: any) => {
        item.address = this.wallet.convertAddress('legacy', 'cashaddr', item.address)
      })
      this.changeAddrs.forEach((item: any) => {
        item.address = this.wallet.convertAddress('legacy', 'cashaddr', item.address)
      })
      this.unspentAddrs.forEach((item: any) => {
        item.address = this.wallet.convertAddress('legacy', 'cashaddr', item.address)
      })
    }
  }

  pushAddressPage(addr: any) {
    this.navCtrl.push('AddressPage', {
      address: addr.address
    })
  }

}
